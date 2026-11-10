"""Static checks complement the real-Chromium interaction suite.
The old scroll-only contract was superseded by the 360-degree world rule.
"""
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class WorldContractTests(unittest.TestCase):
 def test_current_entry(self):
  s=(ROOT/'index.html').read_text()
  self.assertIn('/src/main.js',s)
  for label in ['Fishing Boat Harbour','The Round House','Fremantle Markets','Bathers Beach']:
   self.assertIn(label,s)
 def test_opt_in_audio(self):
  s=(ROOT/'src/core/AudioSystem.js').read_text()
  self.assertIn('this.context = null',s)
  self.assertIn('async toggle()',s)
  self.assertIn('document.hidden',s)
 def test_reset_and_reduced_motion(self):
  s=(ROOT/'src/core/Experience.js').read_text()
  self.assertIn('prefers-reduced-motion: reduce',s)
  self.assertIn('this.controls.reset()',s)
  self.assertIn('this.controls.enableDamping = false',s)
if __name__=='__main__':unittest.main()
