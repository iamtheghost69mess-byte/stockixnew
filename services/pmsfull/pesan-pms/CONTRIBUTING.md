# Contributing to Pesan PMS

Thank you for your interest in contributing to Pesan PMS! Our goal is to provide an open-source property management system for hotels, homestays, villas, and other accommodation properties. We welcome contributions in all forms—from bug fixes and design improvements to brand-new features.

> **Project Overview:**
> Pesan PMS is built with Next.js (app router), React, and Tailwind CSS. The project uses shadcn/ui components and follows modern web development practices. Please ensure your contributions follow our best practices for clarity, maintainability, and consistency.

---

## Table of Contents

- [How to Contribute](#how-to-contribute)
- [Reporting Issues](#reporting-issues)
- [Pull Request Process](#pull-request-process)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Local Development Setup](#local-development-setup)
- [Adding New Features](#adding-new-features)
- [License](#license)

---

## How to Contribute

We strive to keep our workflow as simple as possible. To contribute:

1. **Fork the Repository**
   Click the **Fork** button on GitHub to create your own copy of the project.

2. **Clone Your Fork**
   ```bash
   git clone https://github.com/<your-username>/pesan-pms.git
   ```
3. **Create a Feature Branch**
   Create a new branch with a descriptive name:

   ```bash
   git checkout -b feat/your-feature-name
   ```

   Use a clear naming convention to indicate the type of work (e.g., `feat/`, `fix/`, `docs/`).

4. **Make Your Changes**
   Ensure your changes are small, focused, and adhere to our coding guidelines.

5. **Commit Your Changes**
   Write clear, descriptive commit messages that follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/#specification) specification. This allows us to maintain a coherent project history and generate changelogs automatically. For example:
   - `feat(booking): add new calendar view for reservations`
   - `fix(ui): resolve button alignment issue in dashboard`
   - `docs: update installation instructions`
6. **Push Your Branch**

   ```bash
   git push origin feat/your-feature-name
   ```

7. **Create a Pull Request**
   Open a pull request against the `main` branch on GitHub. Please provide a clear description of the changes and reference any relevant issues (e.g., `fixes #123`).

---

## Reporting Issues

If you discover a bug or have a feature request, please open an issue in our GitHub repository. When opening an issue, ensure you:

- Provide a clear, descriptive title.
- Include as many details as possible (steps to reproduce, screenshots, etc.).
- **Tag Your Issue Appropriately:**
  Use the following labels to help us categorize your issue:
  - **bug:** Something isn't working.
  - **enhancement:** New feature or request.
  - **documentation:** Improvements or updates to documentation.
  - **question:** Further information is requested.
  - **help wanted:** Extra attention is needed.

> **Note:** If you're uncertain which label to use, mention it in your issue description and we'll help categorize it.

---

## Pull Request Process

Before creating a pull request:

- **Ensure Your Branch Is Up-to-Date:**
  Rebase your branch onto the latest `main` branch to prevent merge conflicts.
- **Follow the Guidelines:**
  Make sure your changes are well-tested, follow our coding standards, and include relevant documentation if necessary.

- **Reference Issues:**
  If your PR addresses an existing issue, include `refs #<issue-number>` or `fixes #<issue-number>` in your PR description.

Our maintainers will review your pull request and provide feedback. We aim to make the review process as smooth and timely as possible.

---

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/#specification) standard. Your commit messages should have the following format:

```
<type>[optional scope]: <description>
```

- **Types** may include:
  - `feat` – a new feature
  - `fix` – a bug fix
  - `docs` – documentation changes
  - `style` – code style changes (formatting, missing semicolons, etc.)
  - `refactor` – code changes that neither fix a bug nor add a feature
  - `test` – adding or correcting tests
  - `chore` – changes to tooling, build process, etc.

_Examples:_

- `feat(booking): add room availability calendar`
- `fix(ui): correct misaligned button on dashboard`
- `docs: update installation instructions`

Using clear and consistent commit messages makes it easier for everyone to understand the project history and aids in automating changelog generation.

---

## Local Development Setup

To set up your local development environment:

### Prerequisites

- [Bun](https://bun.sh/) (latest version)
- [Node.js](https://nodejs.org/) (optional, as Bun includes Node.js compatibility)
- [Git](https://git-scm.com/)

### Setup Steps

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/<your-username>/pesan-pms.git
   cd pesan-pms
   ```

2. **Install Dependencies:**

   ```bash
   bun install
   ```

3. **Set Up Environment:**

   - Copy `.example.env` to `.env`
   ```bash
   cp .example.env .env
   ```
   - Configure any required environment variables

4. **Run the Development Server:**

   ```bash
   bun run dev
   ```

5. **Access the Application:**
   - Open `http://localhost:3000` in your browser
   - The application should be running with hot-reloading enabled

### Building for Production

To build the application for production:

```bash
bun run build
```

To start the production server:

```bash
bun run start
```

---

## Adding New Features

When adding new features to Pesan PMS, please follow these guidelines to maintain consistency and quality:

### Feature Development Guidelines

1. **Plan Your Feature:**
   - Clearly define what the feature will do
   - Consider how it fits into the existing architecture
   - Identify any dependencies or impacts on other parts of the application

2. **Follow the Project Structure:**
   - Place components in the appropriate directories
   - Follow the existing naming conventions
   - Reuse existing components when possible

3. **UI/UX Considerations:**
   - Maintain consistency with the existing design
   - Ensure responsive design works on all screen sizes
   - Follow accessibility best practices

4. **Code Quality:**
   - Write clean, maintainable code
   - Add appropriate comments
   - Follow TypeScript best practices
   - Use meaningful variable and function names

5. **Testing:**
   - Test your feature thoroughly
   - Consider edge cases
   - Ensure it works across different browsers and devices

### Key Areas for Contribution

We particularly welcome contributions in these areas:

- **Booking Management:** Enhancing the reservation system
- **Room/Unit Management:** Improving inventory tracking
- **Reporting:** Adding new reports or enhancing existing ones
- **User Interface:** Improving the dashboard and user experience
- **Mobile Responsiveness:** Ensuring the application works well on all devices
- **Documentation:** Improving user and developer documentation

---

## License

This project is licensed under the MIT License. By contributing, you agree that your contributions will be licensed under the MIT License as well.

---

Thank you for taking the time to contribute to Pesan PMS. We truly appreciate your efforts and look forward to collaborating with you!
