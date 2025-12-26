"""Analyst agent - parses tasks and writes user stories."""

from crewai import Agent, LLM

from crew.tools.file_tools import FileWriteTool


def create_analyst_agent(llm: LLM, output_dir: str = "./output") -> Agent:
    """Create the Analyst agent.
    
    The Analyst is responsible for:
    - Understanding the task/feature request
    - Breaking it down into clear user stories
    - Defining acceptance criteria
    - Identifying edge cases and constraints
    
    Args:
        llm: Language model to use for the agent.
        output_dir: Directory for output files.
    
    Returns:
        Configured Analyst agent.
    """
    return Agent(
        role="Business Analyst",
        goal=(
            "Analyze feature requests and create comprehensive user stories "
            "with clear acceptance criteria that developers can implement."
        ),
        backstory=(
            "You are a senior business analyst with 10+ years of experience "
            "in software development. You excel at understanding stakeholder needs "
            "and translating them into actionable technical requirements. "
            "You always consider edge cases, error scenarios, and non-functional "
            "requirements like performance and security."
        ),
        llm=llm,
        tools=[FileWriteTool(output_dir=output_dir)],
        verbose=True,
        allow_delegation=False,
    )

