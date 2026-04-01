import sys
import types
import unittest

import matplotlib
import numpy as np
import pandas as pd

matplotlib.use('Agg')
import matplotlib.pyplot as plt


def install_stub_modules():
    fake_xgboost = types.ModuleType('xgboost')
    fake_xgboost.XGBRegressor = object
    sys.modules.setdefault('xgboost', fake_xgboost)

    fake_model_selection = types.ModuleType('sklearn.model_selection')
    fake_model_selection.train_test_split = lambda *args, **kwargs: args
    fake_model_selection.RandomizedSearchCV = object

    fake_preprocessing = types.ModuleType('sklearn.preprocessing')
    fake_preprocessing.LabelEncoder = object

    fake_metrics = types.ModuleType('sklearn.metrics')
    fake_metrics.r2_score = lambda *args, **kwargs: 0.0
    fake_metrics.mean_absolute_error = lambda *args, **kwargs: 0.0

    fake_ensemble = types.ModuleType('sklearn.ensemble')
    fake_ensemble.IsolationForest = object

    fake_sklearn = types.ModuleType('sklearn')
    fake_sklearn.model_selection = fake_model_selection
    fake_sklearn.preprocessing = fake_preprocessing
    fake_sklearn.metrics = fake_metrics
    fake_sklearn.ensemble = fake_ensemble

    sys.modules.setdefault('sklearn', fake_sklearn)
    sys.modules.setdefault('sklearn.model_selection', fake_model_selection)
    sys.modules.setdefault('sklearn.preprocessing', fake_preprocessing)
    sys.modules.setdefault('sklearn.metrics', fake_metrics)
    sys.modules.setdefault('sklearn.ensemble', fake_ensemble)

    fake_shap = types.ModuleType('shap')
    fake_shap.plots = types.SimpleNamespace()
    sys.modules.setdefault('shap', fake_shap)


install_stub_modules()

from backend.algorithm import robust_insight_tool as insight_tool


class FakeShapSlice:
    def __init__(self, values):
        self.values = np.asarray(values)


class FakeShapValues:
    def __init__(self, feature_names, values):
        self.feature_names = feature_names
        self.values = np.asarray(values)

    def __getitem__(self, key):
        _, feature_name = key
        feature_index = self.feature_names.index(feature_name)
        return FakeShapSlice(self.values[:, feature_index])


SUMMARY_CALLS = []


def draw_stub_beeswarm(*_args, **kwargs):
    SUMMARY_CALLS.append(('beeswarm', kwargs))
    ax = kwargs.get('ax') or plt.gca()
    ax.figure.set_size_inches(8, 3)
    ax.plot([0, 1], [0, 1], color='#2563eb')
    ax.set_ylabel('importance')


def draw_stub_bar(*_args, **kwargs):
    SUMMARY_CALLS.append(('bar', kwargs))
    ax = kwargs.get('ax') or plt.gca()
    ax.figure.set_size_inches(8, 3)
    ax.barh([0, 1], [0.5, 0.8], color='#ff0052')


def draw_stub_scatter(slice_values, ax=None, **_kwargs):
    target_ax = ax or plt.gca()
    xs = np.arange(len(slice_values.values))
    target_ax.scatter(xs, slice_values.values, s=8, color='#ff0052')


insight_tool.SystemContext._fix_matplotlib_chinese = staticmethod(lambda: None)
insight_tool.shap.plots.beeswarm = draw_stub_beeswarm
insight_tool.shap.plots.bar = draw_stub_bar
insight_tool.shap.plots.scatter = draw_stub_scatter


class FullReportLayoutTests(unittest.TestCase):
    def setUp(self):
        SUMMARY_CALLS.clear()

    def test_full_report_uses_stable_manual_layout(self):
        feature_names = [f'f{i}' for i in range(1, 7)]
        shap_values = FakeShapValues(feature_names, np.random.rand(12, len(feature_names)))
        x_sample = pd.DataFrame(np.random.rand(12, len(feature_names)), columns=feature_names)
        y_sample = pd.Series(np.random.rand(12), name='target')

        fig = insight_tool.VisualStudio._draw_report(
            shap_values=shap_values,
            X_sample=x_sample,
            y_sample=y_sample,
            feature_names=feature_names,
            show_actual_y=False,
            full_report_mode=True,
            model_r2=0.91,
            model_mae=0.12,
            target_name='target',
        )

        try:
            if hasattr(fig, 'get_layout_engine'):
                self.assertIsNone(fig.get_layout_engine())
            self.assertLessEqual(fig._suptitle.get_fontsize(), 24)
            self.assertGreater(fig.get_size_inches()[0], 20)
            self.assertGreater(fig.get_size_inches()[1], 15)
            self.assertLess(fig.get_size_inches()[1], 30)
            beeswarm_call = next(kwargs for name, kwargs in SUMMARY_CALLS if name == 'beeswarm')
            bar_call = next(kwargs for name, kwargs in SUMMARY_CALLS if name == 'bar')
            self.assertIsNotNone(beeswarm_call.get('ax'))
            self.assertIsNotNone(bar_call.get('ax'))
            self.assertIsNone(beeswarm_call.get('plot_size'))
        finally:
            plt.close(fig)


if __name__ == '__main__':
    unittest.main()
