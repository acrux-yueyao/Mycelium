import { Background } from './components/Background';
import { SparkleLayer } from './components/SparkleLayer';
import { TendrilLayer } from './components/TendrilLayer';
import { TreeHoleInput } from './components/TreeHoleInput';

/**
 * Root stage. Layer order (bottom → top):
 *   Background (cream + grain + vignette)
 *   TendrilLayer  (SVG — tendrils connecting close entities)
 *   Entity list   (PNG images with framer-motion animations) — added in Step 3+
 *   SparkleLayer  (SVG — ambient twinkles)
 *   TreeHoleInput (text portal)
 */
export default function App() {
  return (
    <div className="stage">
      <Background />
      <TendrilLayer entities={[]} connections={[]} />
      <SparkleLayer />
      <TreeHoleInput onSubmit={() => { /* wired in Step 4 */ }} />
    </div>
  );
}
