"""Code execution tools for agents."""

import os
import subprocess
import sys
from pathlib import Path

from crewai.tools import BaseTool
from pydantic import Field


class PytestRunnerTool(BaseTool):
    """Tool for running pytest on generated code."""

    name: str = "run_tests"
    description: str = (
        "Run pytest on the generated code. "
        "Input can be empty to run all tests, or a specific test file/directory path. "
        "Returns test results including pass/fail status and error messages."
    )
    output_dir: str = Field(default="./output")
    timeout: int = Field(default=120)

    def _run(self, test_path: str = "") -> str:
        """Run pytest and return results."""
        output_path = Path(self.output_dir).resolve()
        
        if not output_path.exists():
            return "Error: Output directory does not exist. No code has been generated yet."
        
        # Build pytest command
        cmd = [
            sys.executable,
            "-m",
            "pytest",
            "-v",
            "--tb=short",
        ]
        
        if test_path:
            full_test_path = output_path / test_path
            if not full_test_path.exists():
                return f"Error: Test path '{test_path}' does not exist."
            cmd.append(str(full_test_path))
        else:
            cmd.append(str(output_path))
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.timeout,
                cwd=str(output_path),
                env={**os.environ, "PYTHONPATH": str(output_path)},
            )
            
            output_parts = []
            
            if result.stdout:
                output_parts.append("=== STDOUT ===")
                output_parts.append(result.stdout)
            
            if result.stderr:
                output_parts.append("=== STDERR ===")
                output_parts.append(result.stderr)
            
            output_parts.append(f"\n=== EXIT CODE: {result.returncode} ===")
            
            if result.returncode == 0:
                output_parts.append("STATUS: ALL TESTS PASSED")
            else:
                output_parts.append("STATUS: TESTS FAILED")
            
            return "\n".join(output_parts)
            
        except subprocess.TimeoutExpired:
            return f"Error: Tests timed out after {self.timeout} seconds."
        except Exception as e:
            return f"Error running tests: {e}"


class PythonExecutorTool(BaseTool):
    """Tool for executing Python code snippets."""

    name: str = "execute_python"
    description: str = (
        "Execute a Python code snippet and return the output. "
        "Use for quick validation of code logic. "
        "Input should be valid Python code."
    )
    timeout: int = Field(default=30)

    def _run(self, code: str) -> str:
        """Execute Python code and return output."""
        if not code.strip():
            return "Error: No code provided."
        
        try:
            result = subprocess.run(
                [sys.executable, "-c", code],
                capture_output=True,
                text=True,
                timeout=self.timeout,
            )
            
            output_parts = []
            
            if result.stdout:
                output_parts.append(result.stdout)
            
            if result.stderr:
                output_parts.append(f"STDERR: {result.stderr}")
            
            if result.returncode != 0:
                output_parts.append(f"Exit code: {result.returncode}")
            
            return "\n".join(output_parts) if output_parts else "Code executed successfully (no output)."
            
        except subprocess.TimeoutExpired:
            return f"Error: Execution timed out after {self.timeout} seconds."
        except Exception as e:
            return f"Error executing code: {e}"

