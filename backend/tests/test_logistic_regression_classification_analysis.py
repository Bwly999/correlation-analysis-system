import unittest


class LogisticRegressionClassificationAnalysisTests(unittest.TestCase):
    def test_analyze_logistic_regression_classification_returns_metrics_for_binary_labels(self):
        from backend.algorithms.logistic_regression_classification_analysis import (
            analyze_logistic_regression_classification,
        )

        rows = []
        for index in range(1, 81):
            temp = float(index)
            pressure = float((index % 7) + 1)
            line = 'L1' if index % 2 == 0 else 'L2'
            label = 'pass' if temp + pressure > 25 else 'fail'
            rows.append({
                'label': label,
                'temp': temp,
                'pressure': pressure,
                'line': line,
            })

        results = analyze_logistic_regression_classification(
            rows,
            'label',
            {'factorNames': ['temp', 'pressure', 'line']},
        )

        self.assertEqual(results['summary']['targetField'], 'label')
        self.assertEqual(results['summary']['classCount'], 2)
        self.assertGreater(results['summary']['sampleCount'], 60)
        self.assertIn('accuracy', results['summary'])
        self.assertIn('auc', results['summary'])
        self.assertIn('macroF1', results['summary'])
        self.assertEqual(results['confusionMatrix']['labels'], ['fail', 'pass'])
        self.assertEqual(len(results['rocCurve']['fpr']), len(results['rocCurve']['tpr']))
        self.assertGreater(len(results['coefficients']), 0)
        self.assertIn('oddsRatio', results['coefficients'][0])

    def test_analyze_logistic_regression_classification_returns_metrics_for_multiclass_labels(self):
        from backend.algorithms.logistic_regression_classification_analysis import (
            analyze_logistic_regression_classification,
        )

        rows = []
        for index in range(1, 121):
            temp = float(index)
            pressure = float((index % 9) + 1)
            line = ['L1', 'L2', 'L3'][index % 3]
            if temp < 40:
                label = 'low'
            elif temp < 80:
                label = 'mid'
            else:
                label = 'high'
            rows.append({
                'label': label,
                'temp': temp,
                'pressure': pressure,
                'line': line,
            })

        results = analyze_logistic_regression_classification(
            rows,
            'label',
            {'factorNames': ['temp', 'pressure', 'line']},
        )

        self.assertEqual(results['summary']['targetField'], 'label')
        self.assertEqual(results['summary']['classCount'], 3)
        self.assertGreater(results['summary']['sampleCount'], 90)
        self.assertIn('macroF1', results['summary'])
        self.assertEqual(results['rocCurve'], None)
        self.assertEqual(results['confusionMatrix']['labels'], ['high', 'low', 'mid'])
        self.assertGreater(len(results['coefficients']), 0)
        self.assertTrue(all('className' in item for item in results['coefficients']))


if __name__ == '__main__':
    unittest.main()
