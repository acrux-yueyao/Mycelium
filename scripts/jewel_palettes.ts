/**
 * jewel_palettes — named spool sets for the wearable spores.
 *
 * plate = the base-plate filament, spools = body filaments (the generator
 * sorts them dark → light and hands them the body's lightness bands).
 * Eye whites / pupils are always #f6f6f1 / #121212 unless --eyes merge.
 * Shared by scripts/spore_jewel.mts (--palette) and scripts/jewel_catalog.mts.
 */
// named spool sets: plate colour + body spools (dark → light order is sorted automatically)
export const PALETTES: Record<string, { zh: string; plate: string; spools: string[]; note: string }> = {
  cream:    { zh: '奶油糖',   plate: '#3b3a4a', spools: ['#f2a7b8', '#8ec5e8', '#f6e7a1'], note: '粉蓝黄三色,深灰底,最像糖果' },
  morandi:  { zh: '莫兰迪',   plate: '#6b6a75', spools: ['#c9b8a8', '#a7b5b0', '#d9cbc1'], note: '低饱和灰调,成人向' },
  forest:   { zh: '森林',     plate: '#1f3b2a', spools: ['#4f8a5b', '#8fbf7f', '#d8e6b6'], note: '绿色渐变,最贴近 companion 家族' },
  ocean:    { zh: '海洋',     plate: '#16324f', spools: ['#2f6f9f', '#6fb3d9', '#cfe9f3'], note: '蓝色渐变,calm 家族' },
  sunset:   { zh: '日落',     plate: '#3a1f2e', spools: ['#e4572e', '#f4a259', '#f9e0a2'], note: '橙红到奶黄,curious / tender' },
  lavender: { zh: '薰衣草',   plate: '#2e2a4a', spools: ['#7c6fcf', '#b7a9f0', '#ece6ff'], note: 'dreamy 家族的本色' },
  sakura:   { zh: '樱花',     plate: '#f7f3ef', spools: ['#e98aa3', '#f5b7c5'], note: '浅底板,两卷粉;白色眼白与底板同色需换 --eyes merge 或浅灰眼白' },
  ink:      { zh: '墨',       plate: '#141414', spools: ['#6e6e6e', '#f2f2f2'], note: '黑白灰,靠高低差说话' },
  neon:     { zh: '霓虹',     plate: '#0d0d1a', spools: ['#ff3cac', '#2bff88', '#ffe600'], note: '荧光耗材,夜店款' },
  earth:    { zh: '大地',     plate: '#4a2c22', spools: ['#b5563a', '#d99a6c', '#efd9b4'], note: '赤陶色,配木珠/麻绳' },
  mintchoc: { zh: '薄荷巧克力', plate: '#3e2723', spools: ['#7fd1b9', '#c7f0e2'], note: '两卷薄荷,巧克力底' },
  gameboy:  { zh: '掌机',     plate: '#0f380f', spools: ['#306230', '#8bac0f', '#9bbc0f'], note: '四阶绿,像素本命' },
  candypop: { zh: '波普',     plate: '#ffffff', spools: ['#ff6b6b', '#4ecdc4', '#ffe66d'], note: '白底板,高饱和三原' },
  brass:    { zh: '黄铜',     plate: '#5a3e1b', spools: ['#c08a3e', '#e0b770'], note: '金属质感耗材(silk/金属粉)' },
  cinnabar: { zh: '朱砂石青', plate: '#2b2b2b', spools: ['#c23b22', '#2e5b88', '#e2c044'], note: '传统色:朱砂、石青、藤黄' },
  mono:     { zh: '单色',     plate: '#2a2a2a', spools: ['#e8e4dc'], note: '底板 + 一卷,零件最少,靠浮雕' },
};

export const PALETTE_NAMES = Object.keys(PALETTES);
