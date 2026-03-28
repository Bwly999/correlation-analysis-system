import unittest


class MultipleLinearRegressionAnalysisTests(unittest.TestCase):
    def test_analyze_multiple_linear_regression_returns_coefficients_and_predictions(self):
        from backend.algorithms.multiple_linear_regression_analysis import (
            analyze_multiple_linear_regression,
        )

        rows = []
        for index in range(1, 61):
            f1 = float(index)
            f2 = float((index % 9) + 1)
            noise = float((index % 4) - 1.5)
            target = 3.2 * f1 + 1.7 * f2 + noise
            rows.append({'target': target, 'f1': f1, 'f2': f2, 'batch': 'A'})

        results = analyze_multiple_linear_regression(rows, 'target', {'factorNames': ['f1', 'f2']})

        self.assertEqual(results['summary']['targetField'], 'target')
        self.assertEqual(results['summary']['featureCount'], 2)
        self.assertGreater(results['summary']['sampleCount'], 40)
        self.assertGreater(results['summary']['r2'], 0.95)
        self.assertIn('adjustedR2', results['summary'])
        self.assertIn('intercept', results['summary'])

        coefficients = results['coefficients']
        self.assertEqual(len(coefficients), 2)
        self.assertEqual(coefficients[0]['name'], 'f1')
        self.assertGreater(coefficients[0]['absCoefficient'], coefficients[1]['absCoefficient'])
        self.assertIn('pValue', coefficients[0])

        predictions = results['predictions']
        self.assertEqual(len(predictions['actual']), len(predictions['predicted']))
        self.assertGreater(len(predictions['actual']), 5)

        residuals = results['residuals']
        self.assertEqual(len(residuals['fitted']), len(residuals['residuals']))
        self.assertGreater(len(residuals['fitted']), 5)


if __name__ == '__main__':
    unittest.main()
