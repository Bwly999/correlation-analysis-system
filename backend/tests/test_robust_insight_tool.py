import unittest
from unittest.mock import patch

import matplotlib.pyplot as plt
import pandas as pd


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

    def test_insight_engine_falls_back_to_tree_explainer_when_generic_explainer_rejects_model(self):
        from backend.algorithm.robust_insight_tool import InsightEngine

        model = object()
        X = pd.DataFrame({'f1': [1.0, 2.0, 3.0], 'f2': [4.0, 5.0, 6.0]})
        y = pd.Series([7.0, 8.0, 9.0], name='target')
        expected_values = object()

        class FakeTreeExplainer:
            def __init__(self, received_model):
                self.received_model = received_model

            def __call__(self, received_X):
                if not received_X.equals(X):
                    raise AssertionError('TreeExplainer 收到的采样数据不正确')
                return expected_values

        with patch(
            'backend.algorithm.robust_insight_tool.shap.Explainer',
            side_effect=TypeError('The passed model is not callable and cannot be analyzed directly with the given masker!'),
        ), patch(
            'backend.algorithm.robust_insight_tool.shap.TreeExplainer',
            side_effect=lambda received_model: FakeTreeExplainer(received_model),
        ):
            X_sample, y_sample, shap_values = InsightEngine(model, X).compute(y)

        self.assertTrue(X_sample.equals(X))
        self.assertTrue(y_sample.equals(y))
        self.assertIs(shap_values, expected_values)

    def test_insight_engine_falls_back_to_predict_function_when_tree_explainer_also_fails(self):
        from backend.algorithm.robust_insight_tool import InsightEngine

        class FakeModel:
            def predict(self, data):
                return [1.0] * len(data)

        model = FakeModel()
        X = pd.DataFrame({'f1': [1.0, 2.0, 3.0], 'f2': [4.0, 5.0, 6.0]})
        y = pd.Series([7.0, 8.0, 9.0], name='target')
        expected_values = object()

        def fake_predict_explainer():
            class FakePredictExplainer:
                def __call__(self, final_X):
                    if not final_X.equals(X):
                        raise AssertionError('predict 兜底执行时采样数据不正确')
                    return expected_values

            return FakePredictExplainer()

        explainer_calls = []

        def fake_explainer(candidate, received_X):
            explainer_calls.append(candidate)
            if not received_X.equals(X):
                raise AssertionError('Explainer 收到的采样数据不正确')
            if len(explainer_calls) == 1:
                if candidate is not model:
                    raise AssertionError('通用 Explainer 应优先接收模型对象')
                raise TypeError('The passed model is not callable and cannot be analyzed directly with the given masker!')
            if getattr(candidate, '__self__', None) is not model or getattr(candidate, '__name__', '') != 'predict':
                raise AssertionError('最终兜底应改用模型的 predict 函数')
            return fake_predict_explainer()

        with patch(
            'backend.algorithm.robust_insight_tool.shap.Explainer',
            side_effect=fake_explainer,
        ), patch(
            'backend.algorithm.robust_insight_tool.shap.TreeExplainer',
            side_effect=ValueError("could not convert string to float: '[4.40875E1]'"),
        ):
            X_sample, y_sample, shap_values = InsightEngine(model, X).compute(y)

        self.assertTrue(X_sample.equals(X))
        self.assertTrue(y_sample.equals(y))
        self.assertIs(shap_values, expected_values)


if __name__ == '__main__':
    unittest.main()
