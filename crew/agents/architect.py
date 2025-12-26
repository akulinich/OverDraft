"""Architect agent - designs system architecture."""

from crewai import Agent, LLM

from crew.tools.file_tools import FileReadTool, FileWriteTool


def create_architect_agent(llm: LLM, output_dir: str = "./output") -> Agent:
    """Create the Architect agent.
    
    The Architect is responsible for:
    - Designing the overall system architecture
    - Defining module structure and dependencies
    - Specifying interfaces and data models
    - Making technology decisions
    
    Args:
        llm: Language model to use for the agent.
        output_dir: Directory for output files.
    
    Returns:
        Configured Architect agent.
    """
    return Agent(
        role="Software Architect",
        goal=(
            "Design clean, modular, and maintainable software architecture "
            "based on user stories, following SOLID principles and best practices."
        ),
        backstory=(
            "You are a principal software architect with deep expertise in "
            "Python and system design. You follow SOLID principles religiously "
            "and believe in clean architecture with clear separation of concerns. "
            "You design for testability, maintainability, and extensibility. "
            "You produce detailed architecture documents with module structures, "
            "class diagrams, and interface definitions."
        ),
        llm=llm,
        tools=[
            FileReadTool(output_dir=output_dir),
            FileWriteTool(output_dir=output_dir),
        ],
        verbose=True,
        allow_delegation=False,
    )

