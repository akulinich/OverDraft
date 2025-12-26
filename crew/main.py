"""CLI entry point for OverDraft development crew."""

import argparse
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

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
        help="Task description to implement, GitHub issue URL (e.g., https://github.com/owner/repo/issues/2), or use --file",
    )
    
    parser.add_argument(
        "-f", "--file",
        type=str,
        help="Read task description from file",
    )
    
    parser.add_argument(
        "-o", "--output",
        type=str,
        default=None,
        help="Output directory for generated files (default: from OUTPUT_DIR env var or ./output)",
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


def is_github_issue_url(url: str) -> bool:
    """Check if the given string is a GitHub issue URL.
    
    Args:
        url: String to check.
    
    Returns:
        True if it's a GitHub issue URL, False otherwise.
    """
    pattern = r'^https?://github\.com/[^/]+/[^/]+/issues/\d+/?$'
    return bool(re.match(pattern, url))


def parse_github_issue_url(url: str) -> tuple[str, str, int]:
    """Parse GitHub issue URL to extract owner, repo, and issue number.
    
    Args:
        url: GitHub issue URL.
    
    Returns:
        Tuple of (owner, repo, issue_number).
    
    Raises:
        ValueError: If URL format is invalid.
    """
    pattern = r'^https?://github\.com/([^/]+)/([^/]+)/issues/(\d+)/?$'
    match = re.match(pattern, url)
    if not match:
        raise ValueError(f"Invalid GitHub issue URL format: {url}")
    return match.group(1), match.group(2), int(match.group(3))


def fetch_github_issue(owner: str, repo: str, issue_number: int) -> str:
    """Fetch GitHub issue content using GitHub API.
    
    Args:
        owner: Repository owner.
        repo: Repository name.
        issue_number: Issue number.
    
    Returns:
        Task description string combining issue title and body.
    
    Raises:
        SystemExit: If issue cannot be fetched.
    """
    api_url = f"https://api.github.com/repos/{owner}/{repo}/issues/{issue_number}"
    
    try:
        request = Request(api_url)
        request.add_header("Accept", "application/vnd.github.v3+json")
        request.add_header("User-Agent", "OverDraft-CrewAI")
        
        # Add GitHub token if available (for private repos or higher rate limits)
        github_token = os.getenv("GITHUB_TOKEN")
        if github_token:
            request.add_header("Authorization", f"token {github_token}")
        
        with urlopen(request, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))
            
            title = data.get("title", "")
            body = data.get("body", "")
            
            # Combine title and body
            if body:
                task_description = f"{title}\n\n{body}"
            else:
                task_description = title
            
            return task_description.strip()
            
    except HTTPError as e:
        if e.code == 404:
            print(
                f"Error: GitHub issue not found. "
                f"Check that the repository is public or provide GITHUB_TOKEN for private repos.",
                file=sys.stderr,
            )
        else:
            print(f"Error: Failed to fetch GitHub issue: HTTP {e.code}", file=sys.stderr)
        sys.exit(1)
    except URLError as e:
        print(f"Error: Network error while fetching GitHub issue: {e}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON response from GitHub API: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: Unexpected error while fetching GitHub issue: {e}", file=sys.stderr)
        sys.exit(1)


def get_task_description(args: argparse.Namespace) -> str:
    """Get task description from args, file, or GitHub issue.
    
    Args:
        args: Parsed command line arguments.
    
    Returns:
        Task description string.
    
    Raises:
        SystemExit: If no task is provided or cannot be fetched.
    """
    if args.file:
        file_path = Path(args.file)
        if not file_path.exists():
            print(f"Error: File '{args.file}' not found.", file=sys.stderr)
            sys.exit(1)
        return file_path.read_text(encoding="utf-8").strip()
    
    if args.task:
        # Check if it's a GitHub issue URL
        if is_github_issue_url(args.task):
            owner, repo, issue_number = parse_github_issue_url(args.task)
            print(f"Fetching GitHub issue: {owner}/{repo}#{issue_number}...")
            return fetch_github_issue(owner, repo, issue_number)
        return args.task
    
    # Try reading from stdin if available
    if not sys.stdin.isatty():
        stdin_input = sys.stdin.read().strip()
        # Check if stdin input is a GitHub issue URL
        if is_github_issue_url(stdin_input):
            owner, repo, issue_number = parse_github_issue_url(stdin_input)
            print(f"Fetching GitHub issue: {owner}/{repo}#{issue_number}...")
            return fetch_github_issue(owner, repo, issue_number)
        return stdin_input
    
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
        print("Note: For private GitHub repos, also set GITHUB_TOKEN in .env", file=sys.stderr)
        sys.exit(1)
    
    # Get model
    model = args.model or os.getenv("OPENAI_MODEL", "gpt-4o")
    
    # Get output directory
    # Priority: command line argument > environment variable > default
    output_dir = args.output if args.output is not None else os.getenv("OUTPUT_DIR", "./output")
    
    # Ensure output directory exists
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    # Get verbose setting
    # Priority: CLI --quiet flag > environment variable > default
    if args.quiet:
        verbose = False
    else:
        crew_verbose_env = os.getenv("CREW_VERBOSE", "true").lower()
        verbose = crew_verbose_env in ("true", "1", "yes", "on")
    
    # Get task description
    task_description = get_task_description(args)
    
    print("=" * 60)
    print("OverDraft Development Team")
    print("=" * 60)
    print(f"Model: {model}")
    print(f"Output: {output_dir}")
    print(f"Verbose: {verbose}")
    print(f"Task: {task_description[:100]}{'...' if len(task_description) > 100 else ''}")
    print("=" * 60)
    print()
    
    # Create and run crew
    dev_team = DevTeamCrew(
        model=model,
        api_key=api_key,
        output_dir=output_dir,
        verbose=verbose,
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

