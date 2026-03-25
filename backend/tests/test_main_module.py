import importlib
import unittest


class MainModuleTests(unittest.TestCase):
    def test_import_main_without_shap_runtime_stack(self):
        main = importlib.import_module('backend.main')

        self.assertTrue(hasattr(main, 'app'))
        self.assertTrue(hasattr(main, 'analyze_lasso'))


if __name__ == '__main__':
    unittest.main()
