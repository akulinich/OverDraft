# OverDraft Development Crew

AI-powered development team using CrewAI that automates the full software development lifecycle from requirements to tested implementation.

## Overview

The crew orchestrates a sequential workflow with five specialized agents plus a Manager that validates each stage. The Manager ensures continuous quality by checking alignment with the original task and can loop back to previous stages for fixes, transforming a task description into a complete, tested Python implementation following SOLID principles and best practices.

## Pipeline Workflow

The development process follows this sequential flow with Manager validation after each stage:

```
Task Description
    ↓
[1] Analyst → User Stories (docs/user_stories.md)
    ↓
[2] Manager → Validate User Stories vs Task
    ├─ Approved → Continue
    └─ Issues → Delegate back to Analyst (max 3 iterations)
    ↓
[3] Architect → Architecture Design (docs/architecture.md)
    ↓
[4] Manager → Validate Architecture vs User Stories + Original Task
    ├─ Approved → Continue
    └─ Issues → Delegate back to Architect OR Analyst (max 3 iterations)
        ├─ Architecture issue → Delegate to Architect
        └─ Requirements issue → Delegate to Analyst
    ↓
[5] Developer → Implementation (src/)
    ↓
[6] Manager → Validate Implementation vs Architecture + Original Task
    ├─ Approved → Continue
    └─ Issues → Delegate back to Developer OR Architect OR Analyst (max 3 iterations)
        ├─ Implementation issue → Delegate to Developer
        ├─ Architecture issue → Delegate to Architect
        └─ Requirements issue → Delegate to Analyst
    ↓
[7] Tester → Test Suite (tests/)
    ↓
[8] Manager → Validate Tests + Run All Tests + Check vs Original Task
    ├─ All tests pass + quality OK → Review Report (docs/review_report.md)
    └─ Issues → Delegate back to appropriate agent (Analyst/Architect/Developer/Tester)
```

### Process Details

1. **Analysis Phase**: Task description is analyzed and broken down into user stories with acceptance criteria
2. **Manager Validation (Analysis)**: Validates user stories match the original task requirements
3. **Architecture Phase**: System architecture is designed based on user stories, following SOLID principles
4. **Manager Validation (Architecture)**: Validates architecture matches user stories AND original task
5. **Development Phase**: Code is implemented according to the architecture specification
6. **Manager Validation (Development)**: Validates implementation matches architecture AND original task
7. **Testing Phase**: Comprehensive pytest test suite is created covering all acceptance criteria
8. **Manager Validation (Testing)**: Validates test quality, runs ALL tests, and verifies they pass

## Agents

### 1. Business Analyst
**Role**: `Business Analyst`  
**Responsibility**: Parse task descriptions and create comprehensive user stories

**Deliverables**:
- `docs/user_stories.md` with:
  - Feature overview
  - User stories in "As a [user], I want [feature], so that [benefit]" format
  - Acceptance criteria for each story
  - Edge cases and error scenarios
  - Non-functional requirements

**Tools**: `FileWriteTool`

**Characteristics**:
- 10+ years of experience in software development
- Considers edge cases, error scenarios, and non-functional requirements
- Translates stakeholder needs into actionable technical requirements

---

### 2. Software Architect
**Role**: `Software Architect`  
**Responsibility**: Design clean, modular, and maintainable software architecture

**Deliverables**:
- `docs/architecture.md` with:
  - High-level architecture overview
  - Module/package structure
  - Class definitions with type hints
  - Data models/schemas
  - Error types
  - File structure

**Tools**: `FileReadTool`, `FileWriteTool`

**Principles**:
- SOLID principles
- Single responsibility per class/module
- Dependency injection for testability
- Clear interfaces between components
- No circular dependencies

**Characteristics**:
- Principal architect with deep Python expertise
- Designs for testability, maintainability, and extensibility
- Produces detailed architecture documents

---

### 3. Senior Python Developer
**Role**: `Senior Python Developer`  
**Responsibility**: Implement production-quality code based on architecture

**Deliverables**:
- Complete Python implementation in `src/` directory
- Proper package structure with `__init__.py` files
- Fully functional code (not stubs)
- Comprehensive docstrings
- Type hints throughout
- Explicit error handling

**Tools**: `FileReadTool`, `FileWriteTool`, `DirectoryListTool`

**Code Standards**:
- PEP 8 conventions
- Meaningful variable names
- Small, focused functions
- No global mutable state
- Explicit edge case handling
- Dependency injection for testability

**Characteristics**:
- 10+ years of Python experience
- Production-quality code standards
- Testable, maintainable implementations

---

### 4. QA Engineer
**Role**: `QA Engineer`  
**Responsibility**: Write comprehensive pytest test suites

**Deliverables**:
- Test files in `tests/` directory
- One test file per module (`test_<module_name>.py`)
- `tests/conftest.py` with shared fixtures
- Coverage of:
  - Happy paths
  - Edge cases from acceptance criteria
  - Error handling scenarios
  - Boundary conditions
  - Invalid inputs

**Tools**: `FileReadTool`, `FileWriteTool`, `DirectoryListTool`

**Test Standards**:
- Deterministic (no random behavior)
- Isolated (no test interdependencies)
- Fast (mock external dependencies)
- Clear test names describing what is tested
- Pytest conventions with fixtures and parametrize

**Characteristics**:
- Senior QA engineer specializing in Python testing
- Tests serve as documentation
- Catches regressions early

---

### 5. Project Manager
**Role**: `Project Manager`  
**Responsibility**: Validate each stage's output against original task and previous stages, run tests, and delegate fixes

**Validation Stages**:
1. **After Analyst**: Validates user stories match original task
2. **After Architect**: Validates architecture matches user stories AND original task
3. **After Developer**: Validates implementation matches architecture AND original task
4. **After Tester**: Validates test quality, runs ALL tests, and verifies they pass

**Deliverables**:
- `docs/validation_status.json` tracking validation status and iterations
- `docs/review_report.md` (final stage only) with:
  - Implementation summary
  - Test coverage summary
  - Validation results
  - Recommendations for future improvements

**Process for Each Validation**:
1. Read original task description
2. Read output from previous stage(s)
3. Validate alignment against:
   - Original task requirements
   - Previous stage outputs (user stories, architecture, etc.)
4. For testing validation: run ALL tests using `run_tests` tool
5. If validation passes: mark as approved
6. If issues found:
   - Determine root cause (implementation, architecture, or requirements issue)
   - Check iteration count (max 3 per stage)
   - Delegate back to appropriate agent(s) with specific feedback
   - Track iterations in validation_status.json

**Delegation Capabilities**:
- **Analysis validation**: Can delegate back to Analyst
- **Architecture validation**: Can delegate back to Architect OR Analyst
- **Development validation**: Can delegate back to Developer, Architect, OR Analyst
- **Testing validation**: Can delegate back to any agent (Analyst/Architect/Developer/Tester)

**Tools**: `FileReadTool`, `FileWriteTool`, `DirectoryListTool`, `PytestRunnerTool`

**Characteristics**:
- Meticulous project manager and technical lead
- Deep understanding of software development lifecycle
- Accurate root cause analysis
- Specific, actionable feedback
- Tracks iterations to prevent infinite loops
- Always validates against the original task

**Delegation**: Enabled (can delegate back to any previous agent based on root cause)

---

## Tools

### File Operations

- **`FileReadTool`**: Read file contents from output directory
- **`FileWriteTool`**: Write content to files (creates directories if needed)
- **`DirectoryListTool`**: List files and directories in output directory

### Code Execution

- **`PytestRunnerTool`**: Run pytest on generated code, returns test results
- **`PythonExecutorTool`**: Execute Python code snippets for quick validation

All tools operate within the configured `output_dir` with path traversal protection.

---

## Usage

The crew is executed via the CLI entry point:

```bash
python -m crew.main "Task description"
python -m crew.main -f task.txt
python -m crew.main -o ./custom_output "Task description"
```

**Configuration**:
- `OPENAI_API_KEY`: Required environment variable
- `OPENAI_MODEL`: Optional (defaults to `gpt-4o`)
- `OUTPUT_DIR`: Optional (defaults to `./output`)

**Output Structure**:
```
output/
├── docs/
│   ├── user_stories.md
│   ├── architecture.md
│   ├── validation_status.json
│   └── review_report.md
├── src/
│   └── [implementation files]
└── tests/
    ├── conftest.py
    └── [test files]
```

---

## Architecture Principles

The crew enforces:

- **SOLID Principles**: Single responsibility, open/closed, Liskov substitution, interface segregation, dependency inversion
- **Clean Architecture**: Clear separation of concerns, layered design
- **Testability**: Dependency injection, mockable interfaces
- **Maintainability**: Well-documented, type-hinted, modular code
- **Determinism**: Reproducible, isolated tests
- **Explicit Error Handling**: No silent failures

---

## Process Configuration

- **Process Type**: Sequential (`Process.sequential`)
- **Memory**: Enabled (agents can access previous task outputs)
- **Verbose**: Configurable (default: enabled)
- **Delegation**: Manager can delegate back to any previous agent based on root cause analysis
- **Iteration Limits**: Maximum 3 iterations per stage to prevent infinite loops
- **Validation**: Manager validates each stage against the original task and previous stages

