#!/usr/bin/env python3
"""
MC03-F — the face board. Generates, autoroutes and exports the PCB.

One board for every creature the engine builds: it fills the 60×72 core
cavity right behind the face, so the ToF window and mic hole are served
by modules glued flat on its FRONT, the eye screens / amp / battery /
touch foils plug into connectors along its edges, and the XIAO sits in a
notch at the top with its USB-C flush with the board edge.

Pipeline (all headless):
  pcbnew API   place footprints + nets + outline      → facebrd.kicad_pcb
  Specctra DSN → Freerouting (xvfb) → SES             → routed tracks
  pcbnew API   GND pours both sides, DRC report       → facebrd_drc.txt
  kicad-cli    gerbers + drill (JLCPCB), SVG previews → out/
  this script  BOM + CPL in JLCPCB column format      → out/

Frame: origin = cavity centre (creature x=90,y=60); +x right, +y DOWN
(KiCad), so creature y → -(y-60). Front (F.Cu) faces the skin.

Usage: python3 hardware/pcb/facebrd_gen.py [out_dir] [--no-route]
"""
import csv
import os
import shutil
import subprocess
import sys

import pcbnew
from pcbnew import VECTOR2I, FromMM as MM

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = '/usr/share/kicad/footprints'
FR_JAR = os.path.expanduser('~/.local/share/freerouting/freerouting.jar')

# ---- board geometry -------------------------------------------------------
BX0, BX1, BY0, BY1, R = -28.0, 28.0, -35.0, 33.0, 5.0     # outline, corner r
NOTCH = (-4.5, 4.5, -16.0)                                # x0, x1, y-bottom (opens to top edge)
HOLES = [(-20, -32), (20, -32), (-20, 23), (20, 23)]      # = MC02-P bosses
TOF_AT, MIC_AT = (0.0, 18.0), (-12.0, 6.0)                # W window / M hole centres (core cells (3,2) / (2,3))

# ---- parts: ref -> (lib, footprint, value, lcsc, (x, y), rot, {pad: net}) --
# LCSC numbers marked '?' must be checked in the JLCPCB parts library before ordering.
XIAO_NETS = {1: 'SDA1', 2: 'I2S_LRC', 3: 'I2S_BCLK', 4: 'I2S_DIN', 5: 'SDA0', 6: 'SCL0',
             7: 'LED_DIN', 8: 'SCL1', 9: 'MIC_SCK', 10: 'MIC_WS', 11: 'MIC_SD',
             12: '3V3', 13: 'GND', 14: 'VBUS'}
PARTS = {
    'U1': ('XIAO', None, 'XIAO-ESP32S3', '', (0, -24.5), 0, XIAO_NETS),   # not stocked at JLCPCB: hand-solder (C48405120 is the nRF52840 Plus!)
    'U2': ('Package_DFN_QFN', 'SiliconLabs_QFN-20-1EP_3x3mm_P0.5mm_EP1.8x1.8mm', 'MPR121QR2',
           'C91322', (-16, -8), 180,
           {2: 'SCL0', 3: 'SDA0', 4: 'GND', 5: 'VREG', 6: 'GND', 7: '3V3', 8: 'REXT',
            **{9 + i: f'ELE{i}' for i in range(12)}, 21: 'GND', '': 'GND'}),
    'U3': ('Sensor_Motion', 'InvenSense_QFN-24_4x4mm_P0.5mm', 'MPU-6050', 'C24112', (16, -4), 0,
           {1: 'GND', 8: '3V3', 9: 'GND', 10: 'REGOUT', 11: 'GND', 13: '3V3', 18: 'GND',
            20: 'CPOUT', 22: 'GND', 23: 'SCL0', 24: 'SDA0'}),
    'C1': ('Capacitor_SMD', 'C_0603_1608Metric', '10uF', 'C19702', (12.5, -28), 0, {1: '3V3', 2: 'GND'}),
    'C2': ('Capacitor_SMD', 'C_0603_1608Metric', '100nF', 'C14663', (12.5, -25.5), 0, {1: '3V3', 2: 'GND'}),
    'C3': ('Capacitor_SMD', 'C_0805_2012Metric', '22uF', 'C45783', (-24.5, 26.0), 90, {1: 'AMP_VIN', 2: 'GND'}),
    'C4': ('Capacitor_SMD', 'C_0603_1608Metric', '100nF', 'C14663', (-13.6, -12.2), 90, {1: '3V3', 2: 'GND'}),
    'C5': ('Capacitor_SMD', 'C_0603_1608Metric', '100nF', 'C14663', (-11.4, -12.2), 90, {1: 'VREG', 2: 'GND'}),
    'R5': ('Resistor_SMD', 'R_0603_1608Metric', '75k', 'C18671', (-15.75, -12.2), 90, {1: 'REXT', 2: 'GND'}),
    'C6': ('Capacitor_SMD', 'C_0603_1608Metric', '100nF', 'C14663', (19.5, 0.5), 0, {1: '3V3', 2: 'GND'}),
    'C7': ('Capacitor_SMD', 'C_0603_1608Metric', '10nF', 'C57112', (13.5, 0.5), 0, {1: '3V3', 2: 'GND'}),
    'C8': ('Capacitor_SMD', 'C_0603_1608Metric', '100nF', 'C14663', (16.5, 0.5), 0, {1: 'REGOUT', 2: 'GND'}),
    'C9': ('Capacitor_SMD', 'C_0603_1608Metric', '2.2nF', 'C1604', (15.5, -8.5), 0, {1: 'CPOUT', 2: 'GND'}),
    'R1': ('Resistor_SMD', 'R_0603_1608Metric', '4.7k', 'C23162', (-14, -31), 0, {1: 'SDA0', 2: '3V3'}),
    'R2': ('Resistor_SMD', 'R_0603_1608Metric', '4.7k', 'C23162', (-14, -27.5), 0, {1: 'SCL0', 2: '3V3'}),
    'R3': ('Resistor_SMD', 'R_0603_1608Metric', '4.7k', 'C23162', (-14, -24), 0, {1: 'SDA1', 2: '3V3'}),
    'R4': ('Resistor_SMD', 'R_0603_1608Metric', '4.7k', 'C23162', (13, -18), 90, {1: 'SCL1', 2: '3V3'}),
    'J1': ('Connector_JST', 'JST_SH_SM04B-SRSS-TB_1x04-1MP_P1.00mm_Horizontal', 'ToF 4P', 'C51940130',
           (21.5, 14), 'right', {1: '3V3', 2: 'GND', 3: 'SDA0', 4: 'SCL0'}),
    'J3': ('Connector_JST', 'JST_SH_SM06B-SRSS-TB_1x06-1MP_P1.00mm_Horizontal', 'EYES 6P', 'C56123098',
           (-23, -22), 'left', {1: '3V3', 2: 'GND', 3: 'SDA0', 4: 'SCL0', 5: 'SDA1', 6: 'SCL1'}),
    'J6': ('Connector_JST', 'JST_SH_SM05B-SRSS-TB_1x05-1MP_P1.00mm_Horizontal', 'AMP 5P', 'C136657',
           (-16.5, 29), 'down', {1: 'AMP_VIN', 2: 'GND', 3: 'I2S_BCLK', 4: 'I2S_LRC', 5: 'I2S_DIN'}),
    'J5': ('Connector_JST', 'JST_SH_SM03B-SRSS-TB_1x03-1MP_P1.00mm_Horizontal', 'LED 3P', 'C53055319',
           (-7.5, 29), 'down', {1: 'VBAT', 2: 'GND', 3: 'LED_DIN'}),
    'J4': ('Connector_JST', 'JST_PH_S2B-PH-SM4-TB_1x02-1MP_P2.00mm_Horizontal', 'BAT', 'C54582899',
           (2, 27.8), 'down', {1: 'VBAT', 2: 'GND'}),
    'J8': ('Connector_JST', 'JST_PH_S2B-PH-SM4-TB_1x02-1MP_P2.00mm_Horizontal', 'CHG', 'C54582899',
           (12, 27.8), 'down', {1: 'VBAT', 2: 'GND'}),
    'J2': ('Connector_PinHeader_2.54mm', 'PinHeader_1x06_P2.54mm_Vertical', 'MIC pads', '',
           (7, -2), 0, {1: 'GND', 2: 'MIC_WS', 3: 'MIC_SCK', 4: 'MIC_SD', 5: '3V3', 6: 'GND'}),
    'J7': ('Connector_PinHeader_2.00mm', 'PinHeader_1x12_P2.00mm_Vertical', 'TOUCH pads', '',
           (-25.5, -8), 0, {i + 1: f'ELE{i}' for i in range(12)}),
    'JP1': ('Jumper', 'SolderJumper-3_P1.3mm_Bridged12_Pad1.0x1.5mm', 'AMP_VIN sel', '',
            (-23.2, 29.8), 0, {1: '3V3', 2: 'AMP_VIN', 3: 'VBAT'}),
    'TP1': ('TestPoint', 'TestPoint_Pad_1.5x1.5mm', 'VBUS', '', (12.5, -32), 0, {1: 'VBUS'}),
    'TP2': ('TestPoint', 'TestPoint_THTPad_1.5x1.5mm_Drill0.7mm', 'BAT+', '', (-2.2, -12.5), 0, {1: 'VBAT'}),
    'TP3': ('TestPoint', 'TestPoint_THTPad_1.5x1.5mm_Drill0.7mm', 'BAT-', '', (2.2, -12.5), 0, {1: 'GND'}),
}
for i, (x, y) in enumerate(HOLES):
    PARTS[f'H{i + 1}'] = ('MountingHole', 'MountingHole_2.2mm_M2_Pad', 'M2', '', (x, y), 0, {1: 'GND'})
# parts the factory does not place (hand-soldered / pads only)
HAND = {'U1', 'J2', 'J7', 'JP1', 'TP1', 'TP2', 'TP3', 'H1', 'H2', 'H3', 'H4'}


def P(x, y):
    return VECTOR2I(MM(x), MM(y))


def xiao_footprint(board):
    """Seeed XIAO ESP32S3, castellated SMD mount. 21 × 17.5 mm, 2 × 7 pads on
    2.54 mm pitch, rows 15.24 apart; pad 1 = D0 top-left, 8 = D7 bottom-right,
    14 = 5V top-right (USB-C at the top edge, y-)."""
    fp = pcbnew.FOOTPRINT(board)
    fp.SetFPID(pcbnew.LIB_ID('MC03', 'XIAO-ESP32S3_SMD'))
    for i in range(7):
        y = -7.62 + 2.54 * i
        for num, x in ((1 + i, -7.85), (14 - i, 7.85)):
            pad = pcbnew.PAD(fp)
            pad.SetNumber(str(num))
            pad.SetAttribute(pcbnew.PAD_ATTRIB_SMD)
            pad.SetShape(pcbnew.PAD_SHAPE_ROUNDRECT)
            pad.SetRoundRectRadiusRatio(0.2)
            pad.SetSize(P(2.4, 1.8))
            pad.SetLayerSet(pad.SMDMask())
            pad.SetPos0(P(x, y)); pad.SetPosition(P(x, y))
            fp.Add(pad)
    for (x0, y0, x1, y1) in ((-8.75, -10.5, 8.75, -10.5), (8.75, -10.5, 8.75, 10.5),
                             (8.75, 10.5, -8.75, 10.5), (-8.75, 10.5, -8.75, -10.5)):
        for layer, w in ((pcbnew.F_SilkS, 0.15), (pcbnew.F_Fab, 0.1)):
            if layer == pcbnew.F_SilkS and y0 == y1 == -10.5:
                continue                     # top edge = board edge (notch); no silk there
            s = pcbnew.FP_SHAPE(fp)
            s.SetShape(pcbnew.SHAPE_T_SEGMENT)
            s.SetStart0(P(x0, y0)); s.SetEnd0(P(x1, y1))
            s.SetStart(P(x0, y0)); s.SetEnd(P(x1, y1))
            s.SetLayer(layer); s.SetWidth(MM(w))
            fp.Add(s)
    t = pcbnew.FP_TEXT(fp)
    t.SetText('USB ▲'); t.SetLayer(pcbnew.F_SilkS)
    t.SetPos0(P(0, -8.3)); t.SetPosition(P(0, -8.3)); t.SetTextSize(P(1, 1))
    fp.Add(t)
    fp.Reference().SetPos0(P(0, 12)); fp.Reference().SetPosition(P(0, 12))
    fp.Value().SetPos0(P(0, 0)); fp.Value().SetPosition(P(0, 0)); fp.Value().SetLayer(pcbnew.F_Fab)
    return fp


def orient_connector(fp, exit_dir):
    """Right-angle JST: pads are the rear tails, MP pads sit toward the cable
    opening. Rotate so the opening faces `exit_dir`."""
    want = {'down': (0, 1), 'up': (0, -1), 'left': (-1, 0), 'right': (1, 0)}[exit_dir]
    best = None
    for ang in (0, 90, 180, 270):
        fp.SetOrientationDegrees(ang)
        sig = [p.GetPosition() for p in fp.Pads() if p.GetNumber() != 'MP']
        mp = [p.GetPosition() for p in fp.Pads() if p.GetNumber() == 'MP']
        dx = sum(p.x for p in mp) / len(mp) - sum(p.x for p in sig) / len(sig)
        dy = sum(p.y for p in mp) / len(mp) - sum(p.y for p in sig) / len(sig)
        score = dx * want[0] + dy * want[1]
        if best is None or score > best[0]:
            best = (score, ang)
    fp.SetOrientationDegrees(best[1])


def outline(board):
    """Rounded rectangle with the XIAO notch cut into the top edge."""
    segs = []
    nx0, nx1, ny = NOTCH
    # top edge, left part → notch → right part
    pts = [(BX0 + R, BY0), (nx0, BY0), (nx0, ny), (nx1, ny), (nx1, BY0), (BX1 - R, BY0)]
    for a, b in zip(pts, pts[1:]):
        segs.append(('L', a, b))
    segs.append(('A', (BX1 - R, BY0), (BX1 - R * (1 - 0.7071), BY0 + R * (1 - 0.7071)), (BX1, BY0 + R)))
    segs.append(('L', (BX1, BY0 + R), (BX1, BY1 - R)))
    segs.append(('A', (BX1, BY1 - R), (BX1 - R * (1 - 0.7071), BY1 - R * (1 - 0.7071)), (BX1 - R, BY1)))
    segs.append(('L', (BX1 - R, BY1), (BX0 + R, BY1)))
    segs.append(('A', (BX0 + R, BY1), (BX0 + R * (1 - 0.7071), BY1 - R * (1 - 0.7071)), (BX0, BY1 - R)))
    segs.append(('L', (BX0, BY1 - R), (BX0, BY0 + R)))
    segs.append(('A', (BX0, BY0 + R), (BX0 + R * (1 - 0.7071), BY0 + R * (1 - 0.7071)), (BX0 + R, BY0)))
    for s in segs:
        sh = pcbnew.PCB_SHAPE(board)
        sh.SetLayer(pcbnew.Edge_Cuts); sh.SetWidth(MM(0.1))
        if s[0] == 'L':
            sh.SetShape(pcbnew.SHAPE_T_SEGMENT)
            sh.SetStart(P(*s[1])); sh.SetEnd(P(*s[2]))
        else:
            sh.SetShape(pcbnew.SHAPE_T_ARC)
            sh.SetArcGeometry(P(*s[1]), P(*s[2]), P(*s[3]))
        board.Add(sh)


def keepout(board, x0, y0, x1, y1):
    """No-track/no-via rule area (exported to the router as a keepout) —
    used along the notch so routes respect the 0.3 mm copper-to-edge rule."""
    z = pcbnew.ZONE(board)
    z.SetIsRuleArea(True)
    z.SetDoNotAllowTracks(True); z.SetDoNotAllowVias(True)
    z.SetDoNotAllowCopperPour(False); z.SetDoNotAllowPads(False); z.SetDoNotAllowFootprints(False)
    z.SetLayerSet(pcbnew.LSET.AllCuMask(2))
    ol = z.Outline(); ol.NewOutline()
    for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)):
        ol.Append(MM(x), MM(y))
    board.Add(z)


def silk(board, text, x, y, size=1.0, layer=pcbnew.F_SilkS, bold=False):
    t = pcbnew.PCB_TEXT(board)
    t.SetText(text); t.SetLayer(layer); t.SetPosition(P(x, y))
    t.SetTextSize(P(size, size)); t.SetTextThickness(MM(size * 0.15)); t.SetBold(bold)
    if layer == pcbnew.B_SilkS:
        t.SetMirrored(True)
    board.Add(t)


def silk_rect(board, x0, y0, x1, y1, layer=pcbnew.F_SilkS, w=0.15):
    for a, b in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
        s = pcbnew.PCB_SHAPE(board)
        s.SetShape(pcbnew.SHAPE_T_SEGMENT); s.SetLayer(layer); s.SetWidth(MM(w))
        s.SetStart(P(*a)); s.SetEnd(P(*b)); board.Add(s)


def build(pcb_path):
    board = pcbnew.NewBoard(pcb_path)
    ds = board.GetDesignSettings()
    # JLCPCB 2-layer capability is 0.127/0.127; 0.15/0.25 leaves margin and
    # still lets a track leave a 0.5 mm-pitch QFN pad
    ds.m_MinClearance = MM(0.15); ds.m_TrackMinWidth = MM(0.2)
    ds.m_ViasMinSize = MM(0.6); ds.m_MinThroughDrill = MM(0.3); ds.m_CopperEdgeClearance = MM(0.3)
    nc = ds.m_NetSettings.m_DefaultNetClass
    nc.SetClearance(MM(0.15)); nc.SetTrackWidth(MM(0.25)); nc.SetViaDiameter(MM(0.6)); nc.SetViaDrill(MM(0.3))

    nets = {}
    def net(name):
        if name not in nets:
            n = pcbnew.NETINFO_ITEM(board, name)
            board.Add(n); nets[name] = n
        return nets[name]

    for ref, (lib, name, value, lcsc, (x, y), rot, padnets) in PARTS.items():
        fp = xiao_footprint(board) if lib == 'XIAO' else pcbnew.FootprintLoad(f'{LIB}/{lib}.pretty', name)
        assert fp, (ref, name)
        fp.SetReference(ref); fp.SetValue(value)
        fp.SetPosition(P(x, y))
        board.Add(fp)
        if isinstance(rot, str):
            orient_connector(fp, rot)
        else:
            fp.SetOrientationDegrees(rot)
        fp.SetPosition(P(x, y))
        for pad in fp.Pads():
            key = pad.GetNumber()
            key = int(key) if key.isdigit() else key
            if key in padnets:
                pad.SetNet(net(padnets[key]))
            elif key == 'MP':                     # connector shields → GND
                pad.SetNet(net('GND'))
        fp.SetProperty('LCSC', lcsc)
        fp.Reference().SetTextSize(P(0.8, 0.8)); fp.Reference().SetTextThickness(MM(0.12))
        if ref.startswith(('H', 'J', 'TP')) or ref == 'JP1':
            fp.Reference().SetVisible(False)
        if ref in ('U2', 'U3') or ref.startswith('H'):
            for pad in fp.Pads():          # reflowed parts: solid zone connection
                pad.SetZoneConnection(pcbnew.ZONE_CONNECTION_FULL)
        fp.Value().SetVisible(False)

    outline(board)
    nx0, nx1, ny = NOTCH
    keepout(board, nx0 - 0.45, BY0, nx0, ny + 0.45)
    keepout(board, nx1, BY0, nx1 + 0.45, ny + 0.45)
    keepout(board, nx0 - 0.45, ny, nx1 + 0.45, ny + 0.45)
    # keep-out guides for the glued modules (front side)
    silk_rect(board, TOF_AT[0] - 12.5, TOF_AT[1] - 5.5, TOF_AT[0] + 12.5, TOF_AT[1] + 5.5)
    silk(board, 'VL53L0X 模块贴此 · 镜头对准W窗', TOF_AT[0], TOF_AT[1], 0.8)
    silk_rect(board, MIC_AT[0] - 5.5, MIC_AT[1] - 6, MIC_AT[0] + 5.5, MIC_AT[1] + 6)
    silk(board, 'INMP441 麦', MIC_AT[0], MIC_AT[1], 0.8)
    silk(board, 'MC03-F v1 · 正面朝脸 · XIAO BAT±→TP2/TP3', 8, 6.5, 0.8)
    silk(board, 'TOUCH E0..E11', -22.5, 15.8, 0.8)
    silk(board, 'EYES', -23, -27.8, 0.8); silk(board, 'ToF', 21.5, 8.8, 0.8)
    silk(board, 'BAT', 2, 23.3, 0.8); silk(board, 'CHG', 12, 23.3, 0.8)
    silk(board, 'AMP', -16.5, 25.2, 0.8); silk(board, 'LED', -7.5, 25.2, 0.8)
    silk(board, '3V3', -26.7, 29.8, 0.8); silk(board, 'VBAT', -21.6, 27.9, 0.8); silk(board, 'JP1', -23.2, 23.6, 0.8)
    silk(board, 'MC03-F v1  mycelium.yueyao.design', 0, 0, 1.2, pcbnew.B_SilkS)
    silk(board, 'JLCJLCJLCJLC', 0, 14, 1.0, pcbnew.B_SilkS)      # JLCPCB order-number placeholder
    silk(board, 'X ▶', 20.5, -6, 0.8)    # MPU6050 +X points creature-right
    pcbnew.SaveBoard(pcb_path, board)
    return board, nets


def pour_gnd(board, gnd, layers=(pcbnew.B_Cu,)):
    """GND plane on the back only: the front stays a plain routed layer
    (readable, no fragmented pour); GND pads reach the plane by short stubs
    and vias that the router adds itself because the plane is in the DSN."""
    for layer in layers:
        z = pcbnew.ZONE(board)
        z.SetLayer(layer); z.SetNet(gnd)
        z.SetLocalClearance(MM(0.25)); z.SetMinThickness(MM(0.25))
        z.SetPadConnection(pcbnew.ZONE_CONNECTION_THERMAL)
        z.SetThermalReliefGap(MM(0.3)); z.SetThermalReliefSpokeWidth(MM(0.35))
        ol = z.Outline(); ol.NewOutline()
        for x, y in ((BX0, BY0), (BX1, BY0), (BX1, BY1), (BX0, BY1)):
            ol.Append(MM(x), MM(y))
        board.Add(z)
    pcbnew.ZONE_FILLER(board).Fill(board.Zones())


def stitch(board, gnd):
    """Drop one GND via into every island of the front pour that the fill
    left isolated, so both pours (and every GND pad) are one net. Islands
    too thin for a via next to the pad get a via IN the pad (fine for the
    QFN thermal pad and reflowed 0603 pads)."""
    zones = [z for z in board.Zones() if not z.GetIsRuleArea()]
    zf = next((z for z in zones if z.IsOnLayer(pcbnew.F_Cu)), None)
    zb = next(z for z in zones if z.IsOnLayer(pcbnew.B_Cu))
    if zf is None:
        return
    pf, pb = zf.GetFilledPolysList(pcbnew.F_Cu), zb.GetFilledPolysList(pcbnew.B_Cu)
    vias = [t for t in board.GetTracks() if t.GetClass() == 'PCB_VIA' and t.GetNetname() == 'GND']
    gpads = [p for fp in board.GetFootprints() for p in fp.Pads() if p.GetNetname() == 'GND']
    DIRS8 = [(1, 0), (-1, 0), (0, 1), (0, -1), (.7, .7), (-.7, .7), (.7, -.7), (-.7, -.7)]

    def fits(q, i, margin):
        for dx, dy in [(0, 0)] + DIRS8:
            r = VECTOR2I(int(q.x + dx * MM(margin)), int(q.y + dy * MM(margin)))
            if not ((i is None or pf.Contains(r, i)) and pb.Contains(r)):
                return False
        return True

    added = 0
    for i in range(pf.OutlineCount()):
        if any(pf.Contains(v.GetPosition(), i) for v in vias):
            continue
        if any(p.GetAttribute() == pcbnew.PAD_ATTRIB_PTH and pf.Contains(p.GetPosition(), i) for p in gpads):
            continue
        smd = [p for p in gpads if p.GetAttribute() == pcbnew.PAD_ATTRIB_SMD and pf.Contains(p.GetPosition(), i)]
        if not smd:
            continue                                     # copper sliver, nothing to connect
        bb = pf.Outline(i).BBox()
        best, step = None, MM(0.25)
        y = bb.GetTop()
        while y <= bb.GetBottom() and best is None:
            x = bb.GetLeft()
            while x <= bb.GetRight():
                if fits(VECTOR2I(x, y), i, 0.6):
                    best = VECTOR2I(x, y); break
                x += step
            y += step
        if best is None:                                 # via in pad
            for p in sorted(smd, key=lambda p: -p.GetSize().x * p.GetSize().y):
                if min(p.GetSize().x, p.GetSize().y) >= MM(0.8) and fits(p.GetPosition(), None, 0.45):
                    best = p.GetPosition(); break
        if best is None:
            print('WARN: no via spot for island', i, [f"{p.GetParent().GetReference()}.{p.GetNumber()}" for p in smd])
            continue
        v = pcbnew.PCB_VIA(board)
        v.SetPosition(best); v.SetViaType(pcbnew.VIATYPE_THROUGH)
        v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
        v.SetWidth(MM(0.6)); v.SetDrill(MM(0.3)); v.SetNet(gnd)
        board.Add(v); added += 1
    print(f'stitching vias: {added}')
    pcbnew.ZONE_FILLER(board).Fill(board.Zones())


def route(board, pcb_path, out):
    dsn, ses = f'{out}/facebrd.dsn', f'{out}/facebrd.ses'
    nc = board.GetDesignSettings().m_NetSettings.m_DefaultNetClass
    if not os.path.exists(ses) or '--reroute' in sys.argv:
        # the router's clearance maths is a hair looser than KiCad's DRC:
        # route at 0.2, check at 0.15
        nc.SetClearance(MM(0.2))
        assert pcbnew.ExportSpecctraDSN(board, dsn), 'DSN export failed'
        nc.SetClearance(MM(0.15))
        cmd = ['xvfb-run', '-a', 'java', '-jar', FR_JAR, '-de', dsn, '-do', ses, '-mp', '200', '-oit', '0.1', '-mt', '4']
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=1500)
        log = (r.stdout + r.stderr)
        open(f'{out}/freerouting.log', 'w').write(log)
        assert os.path.exists(ses), 'router produced no SES:\n' + log[-2000:]
    n_wire, n_via = import_ses(board, ses)
    print(f'router: {n_wire} wire segments, {n_via} vias')
    pcbnew.SaveBoard(pcb_path, board)
    return board


def _sexp(text):
    """Minimal s-expression reader → nested lists of str."""
    import re
    toks = re.findall(r'\(|\)|"[^"]*"|[^\s()]+', text)
    stack, cur = [], []
    for t in toks:
        if t == '(':
            stack.append(cur); cur = []
        elif t == ')':
            done = cur; cur = stack.pop(); cur.append(done)
        else:
            cur.append(t.strip('"'))
    return cur


def import_ses(board, ses):
    """Specctra session → tracks and vias on the board (the pcbnew importer
    needs a GUI frame; the format is tiny). Units: (resolution um N) → N
    ticks per µm; y is flipped relative to KiCad."""
    tree = _sexp(open(ses).read())[0]
    res = 10
    nets = {n.GetNetname(): n for n in board.GetNetInfo().NetsByName().values()}
    def walk(node):
        nonlocal res
        if isinstance(node, list) and node and node[0] == 'resolution':
            res = float(node[2])
        for ch in (node if isinstance(node, list) else []):
            if isinstance(ch, list):
                walk(ch)
    walk(tree)
    k = 1000.0 * res                        # ticks per mm
    def pt(x, y):
        return VECTOR2I(int(round(float(x) / k * 1e6)), int(round(-float(y) / k * 1e6)))
    n_wire = n_via = 0
    def nets_in(node):
        out = []
        if isinstance(node, list) and node and node[0] == 'net':
            out.append(node)
        for ch in (node if isinstance(node, list) else []):
            if isinstance(ch, list):
                out += nets_in(ch)
        return out
    for netnode in nets_in(tree):
        net = nets.get(netnode[1])
        if net is None:
            continue
        for item in netnode[2:]:
            if not isinstance(item, list):
                continue
            if item[0] == 'wire':
                for path in item[1:]:
                    if isinstance(path, list) and path[0] == 'path':
                        layer, width, coords = path[1], float(path[2]), path[3:]
                        pts = [pt(coords[i], coords[i + 1]) for i in range(0, len(coords) - 1, 2)]
                        for a, b in zip(pts, pts[1:]):
                            t = pcbnew.PCB_TRACK(board)
                            t.SetStart(a); t.SetEnd(b)
                            t.SetWidth(int(round(width / k * 1e6)))
                            t.SetLayer(board.GetLayerID(layer)); t.SetNet(net)
                            board.Add(t); n_wire += 1
            elif item[0] == 'via':
                v = pcbnew.PCB_VIA(board)
                v.SetPosition(pt(item[2], item[3]))
                v.SetViaType(pcbnew.VIATYPE_THROUGH)
                v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
                v.SetWidth(MM(0.6)); v.SetDrill(MM(0.3)); v.SetNet(net)
                board.Add(v); n_via += 1
    return n_wire, n_via


def exports(board, pcb_path, out, nets):
    rep = f'{out}/facebrd_drc.txt'
    pcbnew.WriteDRCReport(board, rep, pcbnew.EDA_UNITS_MILLIMETRES, True)
    board.BuildConnectivity()
    unrouted = board.GetConnectivity().GetUnconnectedCount(False)
    g = f'{out}/gerber'
    shutil.rmtree(g, ignore_errors=True); os.makedirs(g)
    subprocess.run(['kicad-cli', 'pcb', 'export', 'gerbers', '-o', g + '/', '--layers',
                    'F.Cu,B.Cu,F.Paste,B.Paste,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts',
                    '--subtract-soldermask', pcb_path], check=True, capture_output=True)
    subprocess.run(['kicad-cli', 'pcb', 'export', 'drill', '-o', g + '/', '--format', 'excellon',
                    '--excellon-units', 'mm', '--generate-map', pcb_path], check=True, capture_output=True)
    edge = [f for f in os.listdir(g) if 'Edge_Cuts' in f or 'Edge.Cuts' in f]
    assert edge and os.path.getsize(f'{g}/{edge[0]}') > 300, 'board outline gerber missing - JLCPCB rejects the order'
    shutil.make_archive(f'{out}/facebrd_gerber', 'zip', g)
    # JLCPCB BOM / CPL
    with open(f'{out}/facebrd_bom.csv', 'w', newline='') as f:
        w = csv.writer(f); w.writerow(['Comment', 'Designator', 'Footprint', 'LCSC Part #'])
        groups = {}
        for ref, (lib, name, value, lcsc, *_r) in PARTS.items():
            if ref in HAND:
                continue
            groups.setdefault((value, name or 'XIAO-ESP32S3_SMD', lcsc), []).append(ref)
        for (value, name, lcsc), refs in groups.items():
            w.writerow([value, ','.join(refs), name, lcsc])
    with open(f'{out}/facebrd_cpl.csv', 'w', newline='') as f:
        w = csv.writer(f); w.writerow(['Designator', 'Mid X', 'Mid Y', 'Layer', 'Rotation'])
        for fp in board.GetFootprints():
            ref = fp.GetReference()
            if ref in HAND:
                continue
            p = fp.GetPosition()
            w.writerow([ref, f'{pcbnew.ToMM(p.x):.3f}mm', f'{-pcbnew.ToMM(p.y):.3f}mm',
                        'Top' if fp.GetLayer() == pcbnew.F_Cu else 'Bottom', f'{fp.GetOrientationDegrees():.0f}'])
    # previews
    views = (('top', 'F.Cu,F.SilkS,F.Mask,Edge_Cuts', pcb_path), ('bottom', 'B.Cu,B.SilkS,B.Mask,Edge_Cuts', pcb_path))
    # tracks-only view (pours removed) so the routing itself can be read
    nz = f'{out}/_nozone.kicad_pcb'
    bz = pcbnew.LoadBoard(pcb_path)
    for z in list(bz.Zones()):
        if not z.GetIsRuleArea():
            bz.Remove(z)
    pcbnew.SaveBoard(nz, bz)
    views += (('tracks', 'F.Cu,B.Cu,F.SilkS,Edge_Cuts', nz),)
    for side, layers, src in views:
        svg = f'{out}/facebrd_{side}.svg'
        subprocess.run(['kicad-cli', 'pcb', 'export', 'svg', '-o', svg, '--layers', layers,
                        '--page-size-mode', '2', '--exclude-drawing-sheet', src], check=True, capture_output=True)
        try:
            import cairosvg
            cairosvg.svg2png(url=svg, write_to=f'{out}/facebrd_{side}.png', output_width=1400, background_color='white')
        except Exception as e:                      # noqa: BLE001
            print('png preview skipped:', e)
    return rep, unrouted


def main(out, do_route=True):
    os.makedirs(out, exist_ok=True)
    pcb_path = f'{out}/facebrd.kicad_pcb'
    board, nets = build(pcb_path)
    pour_gnd(board, nets['GND'])                 # plane first: the router must see it
    if do_route:
        board = route(board, pcb_path, out)
        nets = {n.GetNetname(): n for n in board.GetNetInfo().NetsByName().values()}
    pcbnew.ZONE_FILLER(board).Fill(board.Zones())
    stitch(board, nets['GND'])
    pcbnew.SaveBoard(pcb_path, board)
    rep, unrouted = exports(board, pcb_path, out, nets)
    txt = open(rep).read()
    print(f'unrouted connections: {unrouted}')
    import collections
    kinds = collections.Counter(l.split(']')[0][1:] for l in txt.splitlines() if l.startswith('['))
    kinds.pop('lib_footprint_issues', None)
    print('DRC:', [l for l in txt.splitlines() if 'Found' in l], dict(kinds))
    print('→', out)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    main(args[0] if args else f'{HERE}/out', '--no-route' not in sys.argv)
