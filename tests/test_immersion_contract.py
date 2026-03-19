import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_JS = (ROOT / 'app.js').read_text(encoding='utf-8')
INDEX_HTML = (ROOT / 'index.html').read_text(encoding='utf-8')
STYLES_CSS = (ROOT / 'styles.css').read_text(encoding='utf-8')


class ImmersionContractTests(unittest.TestCase):
    def test_arrival_horizon_reveal_timing(self):
        self.assertRegex(APP_JS, r"setTimeout\(\(\) => horizon\.classList\.add\('revealed'\),\s*6800\)")

    def test_pause_detection_timing(self):
        self.assertIn("Date.now() - lastInteraction > 2000", APP_JS)

    def test_reflection_message_delay(self):
        self.assertIn("const reflectionStillness = isSmallViewport ? 12000 : 10000;", APP_JS)
        self.assertIn("You've been here before.", INDEX_HTML)
        self.assertIn("document.documentElement.style.setProperty('--luma', '0.18');", APP_JS)

    def test_contains_required_spaces(self):
        for label in ["Harbor Edge", "Historic Core", "Market Pulse", "Bathers Beach", "Western Horizon"]:
            self.assertIn(label, INDEX_HTML)

    def test_parallax_and_wind_variables_exist(self):
        self.assertIn("--drift-x", STYLES_CSS)
        self.assertIn("--wind-x", STYLES_CSS)
        self.assertIn("document.documentElement.style.setProperty('--wind-x'", APP_JS)

    def test_horizon_scroll_resistance(self):
        self.assertRegex(APP_JS, r"progress < 0\.82")
        self.assertRegex(APP_JS, r"smoothstep\(0\.82, 0\.99, progress\)")

    def test_whisper_cards_have_length_budget(self):
        cards = re.findall(r'<div class="whisper-card">\s*([^<]+)\s*</div>', INDEX_HTML)
        self.assertGreaterEqual(len(cards), 4)
        for card in cards:
            words = [w for w in re.split(r"\s+", card.strip()) if w]
            self.assertLessEqual(len(words), 60, f"Whisper card exceeds 60 words: {len(words)}")

    def test_optional_qa_mode_exists_for_device_validation(self):
        self.assertIn("const qaMode = new URLSearchParams(window.location.search).get('qa') === '1';", APP_JS)
        self.assertIn("function setupQaPanel()", APP_JS)
        self.assertIn(".qa-panel", STYLES_CSS)

    def test_zone_microcopy_is_contextual_and_brief(self):
        self.assertIn("const zoneWhispers = {", APP_JS)
        for phrase in [
            "Salt before streets.",
            "Rigging taps the wind.",
            "Stone keeps the day cool.",
            "Warm voices drift together.",
            "Amber slips into indigo.",
            "Hold still at the edge."
        ]:
            self.assertIn(phrase, APP_JS)

    def test_single_whisper_card_focus_behavior(self):
        self.assertIn("const shouldOpen = !trigger.classList.contains('open');", APP_JS)
        self.assertIn("whisperTriggers.forEach((item) => {", APP_JS)
        self.assertIn("item.classList.remove('open');", APP_JS)

    def test_zone_presence_highlight_and_shimmer_pulse(self):
        self.assertIn("function pulseShimmer()", APP_JS)
        self.assertIn("updateCurrentSpace(zone);", APP_JS)
        self.assertIn(".space.is-current", STYLES_CSS)
        self.assertIn(".water-shimmer.pulse", STYLES_CSS)


if __name__ == '__main__':
    unittest.main()
