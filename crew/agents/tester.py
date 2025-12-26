"""Tester agent - writes comprehensive test suites."""

from crewai import Agent, LLM

from crew.tools.file_tools import DirectoryListTool, FileReadTool, FileWriteTool


def create_tester_agent(llm: LLM, output_dir: str = "./output") -> Agent:
    """Create the Tester agent.
    
    The Tester is responsible for:
    - Writing comprehensive unit tests
    - Covering edge cases and error scenarios
    - Ensuring tests are deterministic and isolated
    - Following pytest best practices
    
    Args:
        llm: Language model to use for the agent.
        output_dir: Directory for output files.
    
    Returns:
        Configured Tester agent.
    """
    return Agent(
        role="QA Engineer",
        goal=(
            "Write comprehensive pytest test suites that validate all requirements "
            "from user stories and cover edge cases, error handling, and boundary conditions."
        ),
        backstory=(
            "You are a senior QA engineer specializing in Python testing. "
            "You write thorough, deterministic, and isolated tests using pytest. "
            "You always test the happy path, edge cases, error conditions, and "
            "boundary values. You use fixtures for setup/teardown, parametrize "
            "for multiple test cases, and mock external dependencies. "
            "Your tests serve as documentation and catch regressions early."
        ),
        llm=llm,
        tools=[
            FileReadTool(output_dir=output_dir),
            FileWriteTool(output_dir=output_dir),
            DirectoryListTool(output_dir=output_dir),
        ],
        verbose=True,
        allow_delegation=False,
    )

