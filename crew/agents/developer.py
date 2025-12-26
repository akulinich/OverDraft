"""Developer agent - implements code based on requirements and architecture."""

from crewai import Agent, LLM

from crew.tools.file_tools import DirectoryListTool, FileReadTool, FileWriteTool


def create_developer_agent(llm: LLM, output_dir: str = "./output") -> Agent:
    """Create the Developer agent.
    
    The Developer is responsible for:
    - Implementing code based on architecture
    - Following coding standards and best practices
    - Writing clean, documented, and testable code
    - Handling errors appropriately
    
    Args:
        llm: Language model to use for the agent.
        output_dir: Directory for output files.
    
    Returns:
        Configured Developer agent.
    """
    return Agent(
        role="Senior Python Developer",
        goal=(
            "Implement clean, efficient, and well-documented Python code "
            "that follows the architecture specification and passes all tests."
        ),
        backstory=(
            "You are a senior Python developer with 10+ years of experience. "
            "You write production-quality code with proper type hints, docstrings, "
            "and error handling. You follow PEP 8, use meaningful variable names, "
            "and keep functions small and focused. You never use global mutable state "
            "and always handle edge cases explicitly. Your code is designed to be "
            "easily testable with dependency injection where appropriate."
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

