console.log("process.env.PATH:", process.env.PATH);
const { execSync } = require('child_process');
try {
  console.log("Running docker version...");
  const out = execSync('docker version', { encoding: 'utf8' });
  console.log("Success! Output length:", out.length);
} catch (e) {
  console.error("Failed to run docker version:", e.message);
  if (e.stderr) console.error("Stderr:", e.stderr.toString());
  if (e.stdout) console.error("Stdout:", e.stdout.toString());
}
