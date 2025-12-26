"""CLI entry point for OverDraft development crew."""

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

from crew.dev_team import DevTeamCrew


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        prog="overdraft",
        description="AI-powered development team using CrewAI",
    )
    
    parser.add_argument(
        "task",
        nargs="?",
        help="Task description to implement (or use --file)",
    )
    
    parser.add_argument(
        "-f", "--file",
        type=str,
        help="Read task description from file",
    )
    
    parser.add_argument(
        "-o", "--output",
        type=str,
        default="./output",
        help="Output directory for generated files (default: ./output)",
    )
    
    parser.add_argument(
        "-m", "--model",
        type=str,
        default=None,
        help="OpenAI model to use (default: from env or gpt-4o)",
    )
    
    parser.add_argument(
        "-q", "--quiet",
        action="store_true",
        help="Disable verbose output",
    )
    
    return parser.parse_args()


def get_task_description(args: argparse.Namespace) -> str:
    """Get task description from args or file.
    
    Args:
        args: Parsed command line arguments.
    
    Returns:
        Task description string.
    
    Raises:
        SystemExit: If no task is provided.
    """
    if args.file:
        file_path = Path(args.file)
        if not file_path.exists():
            print(f"Error: File '{args.file}' not found.", file=sys.stderr)
            sys.exit(1)
        return file_path.read_text(encoding="utf-8").strip()
    
    if args.task:
        return args.task
    
    # Try reading from stdin if available
    if not sys.stdin.isatty():
        return sys.stdin.read().strip()
    
    print("Error: No task provided. Use positional argument, --file, or pipe input.", file=sys.stderr)
    parser = argparse.ArgumentParser()
    parser.print_help()
    sys.exit(1)


def main() -> None:
    """Main entry point."""
    # Load environment variables from .env file
    load_dotenv()
    
    args = parse_args()
    
    # Get API key
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY environment variable not set.", file=sys.stderr)
        print("Create a .env file with OPENAI_API_KEY=your-key or export it.", file=sys.stderr)
        sys.exit(1)
    
    # Get model
    model = args.model or os.getenv("OPENAI_MODEL", "gpt-4o")
    
    # Get output directory
    output_dir = args.output or os.getenv("OUTPUT_DIR", "./output")
    
    # Ensure output directory exists
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    # Get task description
    task_description = get_task_description(args)
    
    print("=" * 60)
    print("OverDraft Development Team")
    print("=" * 60)
    print(f"Model: {model}")
    print(f"Output: {output_dir}")
    print(f"Task: {task_description[:100]}{'...' if len(task_description) > 100 else ''}")
    print("=" * 60)
    print()
    
    # Create and run crew
    dev_team = DevTeamCrew(
        model=model,
        api_key=api_key,
        output_dir=output_dir,
        verbose=not args.quiet,
    )
    
    try:
        result = dev_team.run(task_description)
        print()
        print("=" * 60)
        print("EXECUTION COMPLETE")
        print("=" * 60)
        print(result)
        print()
        print(f"Generated files are in: {output_dir}")
    except KeyboardInterrupt:
        print("\nExecution interrupted by user.", file=sys.stderr)
        sys.exit(130)
    except Exception as e:
        print(f"\nError during execution: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

