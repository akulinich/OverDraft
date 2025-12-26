"""File operation tools for agents."""

from pathlib import Path

from crewai.tools import BaseTool
from pydantic import Field


class FileReadTool(BaseTool):
    """Tool for reading file contents."""

    name: str = "read_file"
    description: str = (
        "Read the contents of a file. "
        "Input should be the file path relative to the output directory."
    )
    output_dir: str = Field(default="./output")

    def _run(self, file_path: str) -> str:
        """Read file contents."""
        full_path = Path(self.output_dir) / file_path
        
        if not full_path.exists():
            return f"Error: File '{file_path}' does not exist."
        
        if not full_path.is_file():
            return f"Error: '{file_path}' is not a file."
        
        try:
            return full_path.read_text(encoding="utf-8")
        except Exception as e:
            return f"Error reading file: {e}"


class FileWriteTool(BaseTool):
    """Tool for writing content to files."""

    name: str = "write_file"
    description: str = (
        "Write content to a file. Creates directories if needed. "
        "Input format: 'file_path|||content' where ||| is the separator."
    )
    output_dir: str = Field(default="./output")

    def _run(self, input_str: str) -> str:
        """Write content to file."""
        separator = "|||"
        
        if separator not in input_str:
            return (
                f"Error: Invalid input format. Use 'file_path{separator}content' format."
            )
        
        parts = input_str.split(separator, 1)
        if len(parts) != 2:
            return "Error: Could not parse file path and content."
        
        file_path, content = parts[0].strip(), parts[1]
        full_path = Path(self.output_dir) / file_path
        
        # Security check: prevent path traversal
        try:
            resolved = full_path.resolve()
            output_resolved = Path(self.output_dir).resolve()
            if not str(resolved).startswith(str(output_resolved)):
                return "Error: Path traversal detected. Operation denied."
        except Exception:
            return "Error: Invalid path."
        
        try:
            full_path.parent.mkdir(parents=True, exist_ok=True)
            full_path.write_text(content, encoding="utf-8")
            return f"Successfully wrote {len(content)} characters to '{file_path}'."
        except Exception as e:
            return f"Error writing file: {e}"


class DirectoryListTool(BaseTool):
    """Tool for listing directory contents."""

    name: str = "list_directory"
    description: str = (
        "List files and directories in a given path. "
        "Input should be the directory path relative to output directory, or empty for root."
    )
    output_dir: str = Field(default="./output")

    def _run(self, dir_path: str = "") -> str:
        """List directory contents."""
        full_path = Path(self.output_dir) / dir_path
        
        if not full_path.exists():
            return f"Error: Directory '{dir_path or '.'}' does not exist."
        
        if not full_path.is_dir():
            return f"Error: '{dir_path}' is not a directory."
        
        try:
            items = []
            for item in sorted(full_path.iterdir()):
                prefix = "[DIR]" if item.is_dir() else "[FILE]"
                items.append(f"{prefix} {item.name}")
            
            if not items:
                return "Directory is empty."
            
            return "\n".join(items)
        except Exception as e:
            return f"Error listing directory: {e}"

