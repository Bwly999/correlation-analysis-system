import unittest
from unittest.mock import patch

import matplotlib.pyplot as plt


class RobustInsightToolTests(unittest.TestCase):
    def test_resolve_plot_style_falls_back_to_legacy_seaborn_whitegrid(self):
        from backend.algorithm.robust_insight_tool import VisualStudio

        with patch('backend.algorithm.robust_insight_tool.plt.style.available', ['classic', 'seaborn-whitegrid']):
            style_name = VisualStudio._resolve_plot_style()

        self.assertEqual(style_name, 'seaborn-whitegrid')

    def test_call_shap_plot_retries_without_legacy_unsupported_kwargs(self):
        from backend.algorithm.robust_insight_tool import VisualStudio

        calls = []

        def fake_plot(*args, **kwargs):
            calls.append(dict(kwargs))
            if 'ax' in kwargs:
                raise TypeError("beeswarm() got an unexpected keyword argument 'ax'")
            if 'plot_size' in kwargs:
                raise TypeError("beeswarm() got an unexpected keyword argument 'plot_size'")
            return 'ok'

        fig, ax = plt.subplots()
        try:
            result = VisualStudio._call_shap_plot(
                fake_plot,
                object(),
                ax=ax,
                show=False,
                plot_size=None,
                fallback_current_axis=ax,
            )
        finally:
            plt.close(fig)

        self.assertEqual(result, 'ok')
        self.assertEqual(len(calls), 3)
        self.assertIn('ax', calls[0])
        self.assertNotIn('ax', calls[1])
        self.assertIn('plot_size', calls[1])
        self.assertNotIn('plot_size', calls[2])


if __name__ == '__main__':
    unittest.main()
