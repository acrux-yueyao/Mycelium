import { useEffect, useState } from 'react';
import { Background } from './components/Background';
import { Entity } from './components/Entity';
import { SparkleLayer } from './components/SparkleLayer';
import { TendrilLayer } from './components/TendrilLayer';
import { TreeHoleInput } from './components/TreeHoleInput';

/**
 * Root stage. Layer order (bottom → top):
 *   Background (cream + grain + vignette)
 *   TendrilLayer  (SVG — tendrils connecting close entities) [Step 6]
 *   Entity list   (PNG images with framer-motion animations)
 *   SparkleLayer  (SVG — ambient twinkles) [Step 7]
 *   TreeHoleInput (text portal) [Step 4]
 *
 * STEP 3: hardcode a single char0 centered on screen to verify
 * grow / breathe / float animations. No input, no multiple entities.
 */
export default function App() {
  const [center, setCenter] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const update = () => {
      setCenter({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div className="stage">
      <Background />
      <TendrilLayer entities={[]} connections={[]} />
      {center.x > 0 && (
        <Entity id="demo" charId={0} x={center.x} y={center.y} size={220} />
      )}
      <SparkleLayer />
      <TreeHoleInput onSubmit={() => { /* wired in Step 4 */ }} />
    </div>
  );
}
