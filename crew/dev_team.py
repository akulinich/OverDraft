"""Crew definition for the development team."""

from crewai import Crew, LLM, Process

from crew.agents import (
    create_analyst_agent,
    create_architect_agent,
    create_developer_agent,
    create_manager_agent,
    create_tester_agent,
)
from crew.tasks import (
    create_analysis_task,
    create_architecture_task,
    create_development_task,
    create_manager_validation_analysis_task,
    create_manager_validation_architecture_task,
    create_manager_validation_development_task,
    create_manager_validation_testing_task,
    create_testing_task,
)


class DevTeamCrew:
    """Development team crew orchestrating the full development workflow.
    
    The crew follows this workflow:
    1. Analyst: Parse task -> User Stories
    2. Manager: Validate User Stories vs Task
    3. Architect: User Stories -> Architecture Doc
    4. Manager: Validate Architecture vs User Stories + Task
    5. Developer: Architecture -> Implementation
    6. Manager: Validate Implementation vs Architecture + Task
    7. Tester: Write Test Suite
    8. Manager: Validate Tests + Run All Tests + Check vs Task
    
    Manager can delegate back to previous agents if issues are found (max 3 iterations per stage).
    
    Attributes:
        llm: Language model for all agents.
        output_dir: Directory for generated artifacts.
        verbose: Whether to enable verbose output.
    """

    def __init__(
        self,
        model: str = "gpt-4o",
        api_key: str | None = None,
        output_dir: str = "./output",
        verbose: bool = True,
    ) -> None:
        """Initialize the development team crew.
        
        Args:
            model: OpenAI model name to use.
            api_key: OpenAI API key (uses env var if not provided).
            output_dir: Directory for output files.
            verbose: Enable verbose agent output.
        """
        self.output_dir = output_dir
        self.verbose = verbose
        
        # Initialize LLM
        llm_kwargs = {"model": f"openai/{model}"}
        if api_key:
            llm_kwargs["api_key"] = api_key
        self.llm = LLM(**llm_kwargs)
        
        # Create agents
        self._create_agents()
    
    def _create_agents(self) -> None:
        """Create all agents for the crew."""
        self.analyst = create_analyst_agent(self.llm, self.output_dir)
        self.architect = create_architect_agent(self.llm, self.output_dir)
        self.developer = create_developer_agent(self.llm, self.output_dir)
        self.tester = create_tester_agent(self.llm, self.output_dir)
        self.manager = create_manager_agent(self.llm, self.output_dir)
    
    def create_crew(self, task_description: str) -> Crew:
        """Create the crew with all tasks for a given task description.
        
        Args:
            task_description: The feature/task to implement.
        
        Returns:
            Configured Crew ready to execute.
        """
        # Create tasks with proper context chain and Manager validation after each stage
        analysis_task = create_analysis_task(self.analyst, task_description)
        manager_validation_analysis = create_manager_validation_analysis_task(
            self.manager,
            task_description,
            analysis_task,
        )
        
        architecture_task = create_architecture_task(self.architect, analysis_task)
        manager_validation_architecture = create_manager_validation_architecture_task(
            self.manager,
            task_description,
            analysis_task,
            architecture_task,
        )
        
        development_task = create_development_task(self.developer, architecture_task)
        manager_validation_development = create_manager_validation_development_task(
            self.manager,
            task_description,
            architecture_task,
            development_task,
        )
        
        testing_task = create_testing_task(self.tester, architecture_task)
        manager_validation_testing = create_manager_validation_testing_task(
            self.manager,
            task_description,
            development_task,
            testing_task,
        )
        
        # Create crew with sequential process
        return Crew(
            agents=[
                self.analyst,
                self.manager,
                self.architect,
                self.developer,
                self.tester,
            ],
            tasks=[
                analysis_task,
                manager_validation_analysis,
                architecture_task,
                manager_validation_architecture,
                development_task,
                manager_validation_development,
                testing_task,
                manager_validation_testing,
            ],
            process=Process.sequential,
            verbose=self.verbose,
            memory=True,
        )
    
    def run(self, task_description: str) -> str:
        """Execute the full development workflow.
        
        Args:
            task_description: The feature/task to implement.
        
        Returns:
            Final output from the crew execution.
        """
        crew = self.create_crew(task_description)
        result = crew.kickoff()
        return str(result)

