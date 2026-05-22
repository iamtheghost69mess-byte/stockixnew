/**
 * POS Device Auto-Approval Script
 * 
 * Run this to authorize all pending devices for the local development environment.
 * Usage: node apps/pos-backend/scripts/autoApprove.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from backend
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/posv2';

async function run() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    
    // We use a dynamic schema to avoid importing models that might have different paths
    const Device = mongoose.model('Device', new mongoose.Schema({}, { strict: false }));
    
    console.log('Searching for unauthorized devices...');
    const pending = await Device.find({ status: 'pending' });
    
    if (pending.length === 0) {
        console.log('✅ No pending devices found. Everything is authorized.');
    } else {
        console.log(`Found ${pending.length} pending devices. Authorizing...`);
        const result = await Device.updateMany(
            { status: 'pending' },
            { 
                $set: { 
                    status: 'approved'
                } 
            }
        );
        console.log(`✅ Success! Authorized ${result.modifiedCount} devices.`);
        console.log('You can now refresh your POS terminal and login.');
    }
    
    await mongoose.disconnect();
}

run().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
