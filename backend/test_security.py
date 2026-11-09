import threading
import unittest

from security import (
    RateLimiter, clean_multiline, clean_single_line, contains_html, count_links,
)


class CleaningTests(unittest.TestCase):
    def test_single_line_removes_newlines_and_control_chars(self):
        # Intento de inyección de cabecera de correo
        dirty = "Hola\r\nBcc: victima@x.com\x00\u202e"
        cleaned = clean_single_line(dirty)
        self.assertNotIn("\n", cleaned)
        self.assertNotIn("\r", cleaned)
        self.assertNotIn("\x00", cleaned)
        self.assertNotIn("\u202e", cleaned)

    def test_multiline_keeps_paragraphs_but_drops_hidden_chars(self):
        text = "Línea 1\r\n\r\n\r\n\r\nLínea 2\u200b\x07"
        self.assertEqual(clean_multiline(text), "Línea 1\n\nLínea 2")

    def test_html_detection(self):
        for bad in ["<script>alert(1)</script>", "<img src=x onerror=y>", "< b >", "<!-- x -->"]:
            self.assertTrue(contains_html(bad), bad)
        for good in ["Necesito una API", "3 < 5 y 7 > 2", "a<5", "I <3 Python"]:
            self.assertFalse(contains_html(good), good)

    def test_link_count(self):
        self.assertEqual(count_links("mira https://a.com y www.b.com y http://c.com"), 3)
        self.assertEqual(count_links("sin enlaces"), 0)


class RateLimiterTests(unittest.TestCase):
    def test_second_request_inside_gap_is_blocked(self):
        limiter = RateLimiter(min_gap_s=60)
        self.assertEqual(limiter.check_and_record("ip", now=1000), 0)
        self.assertEqual(limiter.check_and_record("ip", now=1010), 50)

    def test_allowed_again_after_gap(self):
        limiter = RateLimiter(min_gap_s=60)
        limiter.check_and_record("ip", now=1000)
        self.assertEqual(limiter.check_and_record("ip", now=1061), 0)

    def test_hourly_limit(self):
        limiter = RateLimiter(min_gap_s=60, per_hour=3)
        for i in range(3):
            self.assertEqual(limiter.check_and_record("ip", now=1000 + i * 100), 0)
        self.assertGreater(limiter.check_and_record("ip", now=1400), 0)
        self.assertEqual(limiter.check_and_record("ip", now=1000 + 3601), 0)

    def test_daily_limit(self):
        limiter = RateLimiter(min_gap_s=1, per_hour=100, per_day=5)
        for i in range(5):
            self.assertEqual(limiter.check_and_record("ip", now=1000 + i * 10), 0)
        self.assertGreater(limiter.check_and_record("ip", now=1100), 0)

    def test_ips_are_independent(self):
        limiter = RateLimiter(min_gap_s=60)
        limiter.check_and_record("a", now=1000)
        self.assertEqual(limiter.check_and_record("b", now=1001), 0)

    def test_global_cap(self):
        limiter = RateLimiter(min_gap_s=1, global_per_day=3)
        for i in range(3):
            self.assertEqual(limiter.check_and_record(f"ip{i}", now=1000 + i), 0)
        self.assertGreater(limiter.check_and_record("otra", now=1010), 0)

    def test_simultaneous_requests_only_one_passes(self):
        limiter = RateLimiter(min_gap_s=60)
        results = []
        barrier = threading.Barrier(20)

        def worker():
            barrier.wait()
            results.append(limiter.check_and_record("misma-ip", now=5000))

        threads = [threading.Thread(target=worker) for _ in range(20)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        self.assertEqual(results.count(0), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
