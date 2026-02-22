#!/usr/bin/env python3

import unittest
import os
import shutil
import tempfile
import importlib.util
import importlib.machinery
from unittest.mock import patch, MagicMock

class TestInitScript(unittest.TestCase):
    def setUp(self):
        # Create a temp dir and copy the template files into it
        self.temp_dir = tempfile.mkdtemp()
        
        # We need original files from the repo
        repo_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        
        shutil.copy(os.path.join(repo_dir, "os-template.yml"), self.temp_dir)
        shutil.copy(os.path.join(repo_dir, "README.md"), self.temp_dir)
        shutil.copy(os.path.join(repo_dir, ".ai-context.md"), self.temp_dir)
        
        # Load the init script module dynamically
        loader = importlib.machinery.SourceFileLoader('init_module', os.path.join(repo_dir, 'scripts', 'init'))
        spec = importlib.util.spec_from_loader(loader.name, loader)
        self.init_module = importlib.util.module_from_spec(spec)
        loader.exec_module(self.init_module)

        # Patch the file paths in the module
        self.init_module.CONFIG_FILE = os.path.join(self.temp_dir, 'os-template.yml')
        self.init_module.README_FILE = os.path.join(self.temp_dir, 'README.md')
        self.init_module.AI_CONTEXT_FILE = os.path.join(self.temp_dir, '.ai-context.md')

    def tearDown(self):
        shutil.rmtree(self.temp_dir)

    @patch('sys.argv', ['init', '--project-name', 'TestApp', '--owner', 'testuser', '--runtime-mode', 'docker', '--docker-image', 'alpine:latest'])
    def test_normal_execution(self):
        # Suppress stdout to keep test output clean
        with patch('sys.stdout', new_callable=MagicMock):
            self.init_module.main()
            
        # Verify os-template.yml
        with open(self.init_module.CONFIG_FILE, 'r') as f:
            content = f.read()
            self.assertIn('name: "TestApp"', content)
            self.assertIn('owner: "testuser"', content)
            self.assertNotIn('YOUR_PROJECT_NAME', content)
            self.assertIn('docker_image: "alpine:latest"', content)
            
        # Verify README.md
        with open(self.init_module.README_FILE, 'r') as f:
            content = f.read()
            self.assertIn('> **TestApp** — testuser', content)
            
        # Verify .ai-context.md
        with open(self.init_module.AI_CONTEXT_FILE, 'r') as f:
            content = f.read()
            self.assertIn('| 全体 | `works` |', content)
            self.assertIn('INSTRUCTOR NOTE: scripts/init 経由で初期化されました', content)

    @patch('sys.argv', ['init', '--project-name', 'TestApp', '--owner', 'testuser', '--runtime-mode', 'docker'])
    def test_missing_docker_image(self):
        with patch('sys.stdout', new_callable=MagicMock):
            with self.assertRaises(SystemExit) as cm:
                self.init_module.main()
            self.assertEqual(cm.exception.code, 1)

    @patch('sys.argv', ['init', '--project-name', 'TestApp2', '--owner', 'testuser', '--runtime-mode', 'host'])
    def test_idempotency_and_force(self):
        # Run first time
        with patch('sys.stdout', new_callable=MagicMock):
            self.init_module.main()
            
        # Try running again without force
        with patch('sys.stdout', new_callable=MagicMock):
            with self.assertRaises(SystemExit) as cm:
                self.init_module.main()
            self.assertEqual(cm.exception.code, 1)

        # Try running again with force
        with patch('sys.argv', ['init', '--project-name', 'TestApp2', '--owner', 'testuser', '--runtime-mode', 'host', '--force']):
            with patch('sys.stdout', new_callable=MagicMock):
                try:
                    self.init_module.main()
                except SystemExit:
                    self.fail("main() raised SystemExit unexpectedly with --force!")

    @patch('builtins.input', side_effect=['InteractiveApp', 'owner', 'desc', 'host'])
    def test_interactive_mode(self, mock_input):
        with patch('sys.argv', ['init']):
            with patch('sys.stdout', new_callable=MagicMock):
                self.init_module.main()
                
        # Verify os-template.yml was updated
        with open(self.init_module.CONFIG_FILE, 'r') as f:
            content = f.read()
            self.assertIn('name: "InteractiveApp"', content)
            self.assertIn('mode: "host"', content)

if __name__ == '__main__':
    unittest.main()
