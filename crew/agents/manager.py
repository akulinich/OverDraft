"""Manager agent - validates each stage and orchestrates feedback loop."""

from crewai import Agent, LLM

from crew.tools.code_tools import PytestRunnerTool
from crew.tools.file_tools import DirectoryListTool, FileReadTool, FileWriteTool


def create_manager_agent(llm: LLM, output_dir: str = "./output") -> Agent:
    """Create the Manager agent.
    
    The Manager is responsible for:
    - Validating each stage's output against original task and previous stages
    - Running tests and verifying all tests pass
    - Determining root causes of issues
    - Delegating fixes back to appropriate agents
    - Tracking iterations to prevent infinite loops
    
    Args:
        llm: Language model to use for the agent.
        output_dir: Directory for output files.
    
    Returns:
        Configured Manager agent.
    """
    return Agent(
        role="Project Manager",
        goal=(
            "Validate that each stage's output meets requirements by checking alignment "
            "with the original task and previous stages. Run tests, analyze failures, "
            "determine root causes, and delegate fixes back to appropriate agents when needed."
        ),
        backstory=(
            "You are a meticulous project manager and technical lead with deep understanding "
            "of software development lifecycle. You validate each stage's deliverables against "
            "the original requirements and ensure consistency across all stages. "
            "You run tests, analyze failures, and determine root causes accurately. "
            "When issues are found, you carefully examine the problem to identify whether "
            "it's an implementation issue, architecture issue, or requirements issue. "
            "You provide specific, actionable feedback and delegate tasks back to the "
            "appropriate agent. You track iterations to prevent infinite loops and ensure "
            "the final deliverable meets all acceptance criteria from the original task."
        ),
        llm=llm,
        tools=[
            FileReadTool(output_dir=output_dir),
            FileWriteTool(output_dir=output_dir),
            DirectoryListTool(output_dir=output_dir),
            PytestRunnerTool(output_dir=output_dir),
        ],
        verbose=True,
        allow_delegation=True,
    )

