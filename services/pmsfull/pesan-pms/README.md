<p align="center">
  <img src="public/placeholder-logo.png" alt="Pesan PMS Logo" width="500"/>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT"></a>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-15.2.4-black" alt="Next.js"></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-blue" alt="React"></a>
  <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-Latest-orange" alt="Bun"></a>
  <a href="https://github.com/yourusername/pesan-pms/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs welcome"></a>
</p>

<p align="center">
  <strong>Pesan PMS</strong> is an open-source property management system designed to help manage hotels, homestays, villas, and other accommodation properties.
</p>

<p align="center">
  <img src="public/frontend-screenshot.png" alt="Pesan PMS Dashboard" width="100%"/>
</p>

## Features

- **Dashboard Overview**: Get a quick glance at your property's performance
- **Booking Management**: Handle reservations, check-ins, and check-outs
- **Guest Management**: Store and manage guest information
- **Room/Unit Management**: Track room availability and maintenance
- **Staff Management**: Manage staff schedules and permissions
- **Reporting**: Generate financial and occupancy reports
- **Multi-property Support**: Manage multiple properties from a single dashboard
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## Roadmap

- [x] Authentication system
- [x] Dashboard UI with charts and reports
- [ ] Property setup wizard
- [ ] Room/unit inventory management
- [ ] Booking calendar
- [ ] Guest profiles
- [ ] Invoicing and payments
- [ ] Housekeeping management
- [ ] Maintenance tracking
- [ ] Channel manager integration
- [ ] API for third-party integrations
- [ ] Mobile app
- [ ] Multi-language support
- [ ] Dark mode

## Getting Started

There are two ways to use Pesan PMS:

1. Self-host the application
2. Contribute to the project development

## How to Self-Host

### Option 1: Using Bun (Recommended)

```bash
# Clone the repository
git clone https://github.com/yourusername/pesan-pms.git
cd pesan-pms

# Install dependencies
bun install

# Create environment file
cp .example.env .env

# Start the development server
bun run dev
```

After running these commands:

1. **Access the Application**:
   - Open [http://localhost:3000](http://localhost:3000) in your browser
   - The application should be running with hot-reloading enabled

2. **Building for Production**:
   ```bash
   # Build the application
   bun run build

   # Start the production server
   bun run start
   ```

### Option 2: Using Docker

```bash
# Clone the repository
git clone https://github.com/yourusername/pesan-pms.git
cd pesan-pms

# Create a .env file for Docker (or use the provided example)
cp .env.docker .env

# Build and start the Docker container
docker-compose up -d

# Access the application at http://localhost:3000
```

The Docker setup will:
- Build the application in a container
- Store the SQLite database in a persistent volume
- Run the application on port 3000

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Authentication**: [Better Auth](https://better-auth.com)
- **UI**: [Shadcn/UI](https://ui.shadcn.com/), [Radix UI](https://www.radix-ui.com/), [Tailwind CSS](https://tailwindcss.com)
- **State Management**: React Context API
- **Runtime & Package Manager**: [Bun](https://bun.sh/)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [shadcn/ui](https://ui.shadcn.com/) for the beautiful UI components
- [Radix UI](https://www.radix-ui.com/) for accessible UI primitives
- [Tailwind CSS](https://tailwindcss.com/) for the utility-first CSS framework
- [Next.js](https://nextjs.org/) for the React framework
- [Better Auth](https://better-auth.com) for the authentication system
- [Bun](https://bun.sh/) for the JavaScript runtime and package manager

##

<p align="center">Made with ❤️ by the Pesan PMS team</p>
