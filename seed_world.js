
/**
 * KAIKU GLOBAL SEEDING SCRIPT
 * 
 * Purpose: Populates the map with 500 messages across major cities.
 * 
 * INSTRUCTIONS:
 * 1. Run the SQL in Supabase to create the 'kaiku_posts' table.
 * 2. Paste your URL and SERVICE_ROLE_KEY below.
 * 3. Run: node seed_world.js
 */

// --- CONFIGURATION: PASTE CREDENTIALS HERE ---
const MANUAL_URL = ""; 
const MANUAL_KEY = ""; 
// ---------------------------------------------

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { 
  fakerEN_US, 
  fakerJA, 
  fakerFI, 
  fakerDE, 
  fakerPT_BR, 
  fakerZH_CN 
} = require('@faker-js/faker');

const supabaseUrl = MANUAL_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = MANUAL_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('\n❌ ERROR: Missing credentials.');
  console.error('Please open seed_world.js and paste your SUPABASE_URL and SERVICE_ROLE_KEY at the top.\n');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const TOTAL_MESSAGES = 500;
const BATCH_SIZE = 50;

const CITIES = [
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503, faker: fakerJA },
  { name: 'New York', lat: 40.7128, lng: -74.0060, faker: fakerEN_US },
  { name: 'Helsinki', lat: 60.1699, lng: 24.9384, faker: fakerFI },
  { name: 'Berlin', lat: 52.5200, lng: 13.4050, faker: fakerDE },
  { name: 'Rio de Janeiro', lat: -22.9068, lng: -43.1729, faker: fakerPT_BR },
  { name: 'Shanghai', lat: 31.2304, lng: 121.4737, faker: fakerZH_CN }
];

const getRandomFloat = (min, max) => Math.random() * (max - min) + min;

const jitterLocation = (lat, lng) => {
  const JITTER_RADIUS = 0.08; 
  return {
    lat: lat + getRandomFloat(-JITTER_RADIUS, JITTER_RADIUS),
    lng: lng + getRandomFloat(-JITTER_RADIUS, JITTER_RADIUS)
  };
};

async function seedDatabase() {
  console.log(`\n🌍 KAIKU SEEDER: Generating ${TOTAL_MESSAGES} messages...`);
  
  const allMessages = [];

  for (let i = 0; i < TOTAL_MESSAGES; i++) {
    const city = CITIES[Math.floor(Math.random() * CITIES.length)];
    const loc = jitterLocation(city.lat, city.lng);
    const text = city.faker.lorem.sentence({ min: 3, max: 12 });
    const createdAt = city.faker.date.recent({ days: 2 }).toISOString();

    allMessages.push({
      text: text,
      latitude: loc.lat,
      longitude: loc.lng,
      city_name: city.name,
      score: city.faker.number.int({ min: -4, max: 15 }),
      session_id: city.faker.string.uuid(),
      created_at: createdAt,
      parent_post_id: null
    });
  }

  console.log(`📡 Uploading to Supabase table 'kaiku_posts'...`);

  for (let i = 0; i < allMessages.length; i += BATCH_SIZE) {
    const batch = allMessages.slice(i, i + BATCH_SIZE);
    
    const { error } = await supabase
      .from('kaiku_posts')
      .insert(batch);

    if (error) {
      console.error(`❌ Batch Error (${i}-${i+BATCH_SIZE}):`, error.message);
      if (error.message.includes('relation "kaiku_posts" does not exist')) {
        console.error("TIP: You need to create the table in Supabase first! Run the SQL provided in the chat.");
        process.exit(1);
      }
    } else {
      process.stdout.write('.');
    }
  }

  console.log('\n\n✅ Seeding Complete!');
  console.log('Refresh your KAIKU app to see the global activity zones.');
}

seedDatabase();
