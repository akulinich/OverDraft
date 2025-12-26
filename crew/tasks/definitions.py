"""Task definitions for the development workflow."""

from crewai import Agent, Task


def create_analysis_task(agent: Agent, task_description: str) -> Task:
    """Create the analysis task for the Analyst agent.
    
    Args:
        agent: The Analyst agent.
        task_description: The feature/task description to analyze.
    
    Returns:
        Configured analysis Task.
    """
    return Task(
        description=f"""Analyze the following task/feature request and create comprehensive user stories.

## Task Description
{task_description}

## Your Deliverables
1. Create a file `docs/user_stories.md` with:
   - Overview of the feature
   - User stories in the format: "As a [user], I want [feature], so that [benefit]"
   - Acceptance criteria for each story
   - Edge cases and error scenarios to handle
   - Non-functional requirements (if any)

2. Be specific and actionable. Each acceptance criterion should be testable.

3. Consider:
   - Input validation requirements
   - Error handling scenarios
   - Boundary conditions
   - Security considerations (if applicable)

Write the user stories file using the write_file tool.""",
        expected_output=(
            "A comprehensive user_stories.md file saved to docs/user_stories.md "
            "containing all user stories with acceptance criteria."
        ),
        agent=agent,
    )


def create_architecture_task(agent: Agent, analysis_task: Task) -> Task:
    """Create the architecture task for the Architect agent.
    
    Args:
        agent: The Architect agent.
        analysis_task: The completed analysis task for context.
    
    Returns:
        Configured architecture Task.
    """
    return Task(
        description="""Design the software architecture based on the user stories.

## Your Deliverables
1. Read the user stories from `docs/user_stories.md`

2. Create a file `docs/architecture.md` with:
   - High-level architecture overview
   - Module/package structure
   - Class definitions with:
     - Class name and purpose
     - Attributes with types
     - Method signatures with type hints
     - Dependencies
   - Data models / schemas
   - Error types to define
   - File structure to create

3. Follow these principles:
   - SOLID principles
   - Single responsibility per class/module
   - Dependency injection for testability
   - Clear interfaces between components
   - No circular dependencies

4. The architecture should be implementable in Python with:
   - Type hints throughout
   - Dataclasses or Pydantic for data models
   - Abstract base classes for interfaces (if needed)

Write the architecture document using the write_file tool.""",
        expected_output=(
            "A detailed architecture.md file saved to docs/architecture.md "
            "with module structure, class definitions, and interfaces."
        ),
        agent=agent,
        context=[analysis_task],
    )


def create_development_task(agent: Agent, architecture_task: Task) -> Task:
    """Create the development task for the Developer agent.
    
    Args:
        agent: The Developer agent.
        architecture_task: The completed architecture task for context.
    
    Returns:
        Configured development Task.
    """
    return Task(
        description="""Implement the code based on the architecture specification.

## Your Deliverables
1. Read the architecture from `docs/architecture.md`
2. Read the user stories from `docs/user_stories.md`

3. Implement all modules and classes as specified:
   - Create proper package structure with __init__.py files
   - Implement each class with full functionality
   - Add comprehensive docstrings
   - Use type hints throughout
   - Handle errors explicitly
   - Follow PEP 8 conventions

4. Create files in the `src/` directory following the architecture

5. Ensure code is:
   - Fully functional (not stubs)
   - Testable with dependency injection
   - Well-documented
   - Following all acceptance criteria

Write each file using the write_file tool with the correct path.""",
        expected_output=(
            "Complete, working Python implementation in src/ directory "
            "following the architecture specification."
        ),
        agent=agent,
        context=[architecture_task],
    )


def create_testing_task(agent: Agent, architecture_task: Task) -> Task:
    """Create the testing task for the Tester agent.
    
    Args:
        agent: The Tester agent.
        architecture_task: The completed architecture task for context.
    
    Returns:
        Configured testing Task.
    """
    return Task(
        description="""Write comprehensive pytest tests based on user stories and architecture.

## Your Deliverables
1. Read the user stories from `docs/user_stories.md`
2. Read the architecture from `docs/architecture.md`
3. List and read the implemented code in `src/`

4. Create test files in `tests/` directory:
   - One test file per module (test_<module_name>.py)
   - Use pytest conventions
   - Include fixtures for setup/teardown
   - Use parametrize for multiple test cases

5. Cover:
   - Happy path for each user story
   - Edge cases from acceptance criteria
   - Error handling scenarios
   - Boundary conditions
   - Invalid inputs

6. Tests should be:
   - Deterministic (no random behavior)
   - Isolated (no test interdependencies)
   - Fast (mock external dependencies)
   - Clear (test names describe what is tested)

7. Include a `tests/conftest.py` with shared fixtures

Write each test file using the write_file tool.""",
        expected_output=(
            "Complete pytest test suite in tests/ directory "
            "covering all acceptance criteria and edge cases."
        ),
        agent=agent,
        context=[architecture_task],
    )


def create_manager_validation_analysis_task(
    agent: Agent,
    task_description: str,
    analysis_task: Task,
) -> Task:
    """Create the Manager validation task for the Analyst stage.
    
    Args:
        agent: The Manager agent.
        task_description: The original task description.
        analysis_task: The completed analysis task for context.
    
    Returns:
        Configured Manager validation Task for analysis stage.
    """
    return Task(
        description=f"""Validate that the user stories match the original task requirements.

## Original Task Description
{task_description}

## Your Process
1. Read the original task description above
2. Read the user stories from `docs/user_stories.md`
3. Validate that:
   - All requirements from the original task are covered in user stories
   - User stories accurately reflect the task intent
   - Acceptance criteria are testable and complete
   - Edge cases and error scenarios are addressed

## If Validation Passes
- Create a validation status file `docs/validation_status.json` with:
  - Stage: "analysis"
  - Status: "approved"
  - Iteration: 1
- Mark this validation as complete

## If Issues Found
- Determine the specific problems:
  - Missing requirements
  - Incorrect interpretation of task
  - Incomplete acceptance criteria
  - Missing edge cases
- Check iteration count in `docs/validation_status.json` (if exists)
- If iteration count < 3:
  - Update validation_status.json with iteration count
  - Delegate back to the Analyst agent with specific feedback on what needs to be fixed
  - Include the original task description in the delegation
- If iteration count >= 3:
  - Document the issues in `docs/validation_status.json`
  - Mark as approved with warnings (to prevent infinite loop)

## Expected Output
Validation status file indicating approval or delegation back to Analyst.""",
        expected_output=(
            "Validation status file in docs/validation_status.json indicating "
            "approval or delegation back to Analyst with specific feedback."
        ),
        agent=agent,
        context=[analysis_task],
    )


def create_manager_validation_architecture_task(
    agent: Agent,
    task_description: str,
    analysis_task: Task,
    architecture_task: Task,
) -> Task:
    """Create the Manager validation task for the Architect stage.
    
    Args:
        agent: The Manager agent.
        task_description: The original task description.
        analysis_task: The completed analysis task for context.
        architecture_task: The completed architecture task for context.
    
    Returns:
        Configured Manager validation Task for architecture stage.
    """
    return Task(
        description=f"""Validate that the architecture matches both the user stories AND the original task.

## Original Task Description
{task_description}

## Your Process
1. Read the original task description above
2. Read the user stories from `docs/user_stories.md`
3. Read the architecture from `docs/architecture.md`
4. Validate that:
   - Architecture covers all user stories
   - Architecture aligns with the original task requirements
   - Module structure is logical and follows SOLID principles
   - Dependencies are clear and non-circular
   - Data models match requirements

## If Validation Passes
- Create/update `docs/validation_status.json` with:
  - Stage: "architecture"
  - Status: "approved"
  - Iteration: 1
- Mark this validation as complete

## If Issues Found
- Determine the root cause:
  - Architecture issue (wrong design, missing components, SOLID violations) → Delegate to Architect
  - Requirements issue (architecture is correct but user stories are wrong) → Delegate to Analyst
- Check iteration count in `docs/validation_status.json` for the appropriate stage
- If iteration count < 3:
  - Update validation_status.json with iteration count
  - Delegate back to the appropriate agent (Architect OR Analyst) with specific feedback
  - Include the original task description and relevant context in the delegation
- If iteration count >= 3:
  - Document the issues in `docs/validation_status.json`
  - Mark as approved with warnings (to prevent infinite loop)

## Expected Output
Validation status file indicating approval or delegation back to Architect or Analyst.""",
        expected_output=(
            "Validation status file in docs/validation_status.json indicating "
            "approval or delegation back to Architect or Analyst with specific feedback."
        ),
        agent=agent,
        context=[analysis_task, architecture_task],
    )


def create_manager_validation_development_task(
    agent: Agent,
    task_description: str,
    architecture_task: Task,
    development_task: Task,
) -> Task:
    """Create the Manager validation task for the Developer stage.
    
    Args:
        agent: The Manager agent.
        task_description: The original task description.
        architecture_task: The completed architecture task for context.
        development_task: The completed development task for context.
    
    Returns:
        Configured Manager validation Task for development stage.
    """
    return Task(
        description=f"""Validate that the implementation matches both the architecture AND the original task.

## Original Task Description
{task_description}

## Your Process
1. Read the original task description above
2. Read the architecture from `docs/architecture.md`
3. List and read the implemented code files in `src/`
4. Validate that:
   - Implementation follows the architecture specification
   - All classes and modules from architecture are implemented
   - Code aligns with the original task requirements
   - Type hints, docstrings, and error handling are present
   - Code structure matches the architecture

## If Validation Passes
- Create/update `docs/validation_status.json` with:
  - Stage: "development"
  - Status: "approved"
  - Iteration: 1
- Mark this validation as complete

## If Issues Found
- Determine the root cause:
  - Implementation issue (code doesn't match architecture, bugs, missing features) → Delegate to Developer
  - Architecture issue (architecture is wrong, needs changes) → Delegate to Architect
  - Requirements issue (requirements changed or misunderstood) → Delegate to Analyst
- Check iteration count in `docs/validation_status.json` for the appropriate stage
- If iteration count < 3:
  - Update validation_status.json with iteration count
  - Delegate back to the appropriate agent (Developer, Architect, OR Analyst) with specific feedback
  - Include the original task description and relevant context in the delegation
- If iteration count >= 3:
  - Document the issues in `docs/validation_status.json`
  - Mark as approved with warnings (to prevent infinite loop)

## Expected Output
Validation status file indicating approval or delegation back to Developer, Architect, or Analyst.""",
        expected_output=(
            "Validation status file in docs/validation_status.json indicating "
            "approval or delegation back to Developer, Architect, or Analyst with specific feedback."
        ),
        agent=agent,
        context=[architecture_task, development_task],
    )


def create_manager_validation_testing_task(
    agent: Agent,
    task_description: str,
    development_task: Task,
    testing_task: Task,
) -> Task:
    """Create the Manager validation task for the Tester stage.
    
    Args:
        agent: The Manager agent.
        task_description: The original task description.
        development_task: The completed development task for context.
        testing_task: The completed testing task for context.
    
    Returns:
        Configured Manager validation Task for testing stage.
    """
    return Task(
        description=f"""Validate test quality, run ALL tests, and verify they pass.

## Original Task Description
{task_description}

## Your Process
1. Read the original task description above
2. Read the user stories from `docs/user_stories.md`
3. List and read test files in `tests/`
4. Validate test quality:
   - Tests cover all user stories and acceptance criteria
   - Tests are well-structured and follow pytest conventions
   - Tests are deterministic and isolated
   - Edge cases and error scenarios are covered
5. Run ALL tests using the run_tests tool (not just new tests)
6. Verify that ALL tests pass

## If Validation Passes (Tests Pass + Quality OK)
- Create/update `docs/validation_status.json` with:
  - Stage: "testing"
  - Status: "approved"
  - Iteration: 1
- Create a final report in `docs/review_report.md` with:
  - Summary of what was implemented
  - Test coverage summary
  - Validation results
  - Any recommendations for future improvements
- Mark this validation as complete

## If Issues Found
- Determine the root cause:
  - Test quality issue (tests are poorly written, missing coverage) → Delegate to Tester
  - Test failure due to implementation bug → Delegate to Developer
  - Test failure due to architecture issue → Delegate to Architect
  - Test failure due to requirements issue → Delegate to Analyst
- Check iteration count in `docs/validation_status.json` for the appropriate stage
- If iteration count < 3:
  - Update validation_status.json with iteration count
  - Delegate back to the appropriate agent (Tester, Developer, Architect, OR Analyst) with specific feedback
  - Include the original task description, test results, and relevant context in the delegation
- If iteration count >= 3:
  - Document the issues in `docs/validation_status.json`
  - Mark as approved with warnings (to prevent infinite loop)

## Expected Output
Validation status file and review report indicating approval or delegation back to appropriate agent.""",
        expected_output=(
            "Validation status file in docs/validation_status.json and review_report.md "
            "indicating approval or delegation back to appropriate agent with specific feedback."
        ),
        agent=agent,
        context=[development_task, testing_task],
    )

