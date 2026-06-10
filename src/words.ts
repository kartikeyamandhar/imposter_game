// Word bank for Suss.
// ~50 words per category, 10 categories, organized into clusters of related
// words. Decoy Word mode picks the civilian word and the imposter's decoy word
// from the SAME cluster, so the imposter's clues are plausible but subtly off.
//
// NOTE: public/words.js holds an identical copy of CATEGORIES for the
// build-free offline client. Keep the two in sync if you edit the word list.

export type WordCluster = string[]; // 2-4 related words
export interface Category {
  name: string;
  clusters: WordCluster[];
}

export const CATEGORIES: Category[] = [
  {
    name: "Animals",
    clusters: [
      ["Dolphin", "Whale", "Shark", "Seal"],
      ["Eagle", "Falcon", "Hawk", "Owl"],
      ["Chameleon", "Iguana", "Gecko", "Lizard"],
      ["Wolf", "Coyote", "Fox", "Jackal"],
      ["Lion", "Tiger", "Leopard", "Cheetah"],
      ["Frog", "Toad", "Newt", "Salamander"],
      ["Bee", "Wasp", "Hornet", "Ant"],
      ["Butterfly", "Moth", "Dragonfly", "Ladybug"],
      ["Octopus", "Squid", "Jellyfish", "Crab"],
      ["Penguin", "Pelican", "Flamingo", "Stork"],
      ["Horse", "Donkey", "Zebra", "Mule"],
      ["Rabbit", "Hare", "Hamster", "Guinea Pig"],
      ["Bear", "Panda", "Sloth", "Raccoon"],
      ["Snake", "Cobra", "Python", "Viper"],
      ["Elephant", "Rhino", "Hippo", "Giraffe"],
    ],
  },
  {
    name: "Food & Drink",
    clusters: [
      ["Pizza", "Calzone", "Lasagna", "Pasta"],
      ["Burger", "Hot Dog", "Sandwich", "Wrap"],
      ["Sushi", "Sashimi", "Ramen", "Tempura"],
      ["Taco", "Burrito", "Quesadilla", "Nachos"],
      ["Coffee", "Espresso", "Latte", "Cappuccino"],
      ["Tea", "Matcha", "Chai", "Kombucha"],
      ["Apple", "Pear", "Peach", "Plum"],
      ["Strawberry", "Raspberry", "Blueberry", "Cherry"],
      ["Chocolate", "Caramel", "Toffee", "Fudge"],
      ["Pancake", "Waffle", "Crepe", "French Toast"],
      ["Cheese", "Butter", "Yogurt", "Cream"],
      ["Soup", "Stew", "Curry", "Chowder"],
      ["Bread", "Bagel", "Croissant", "Muffin"],
      ["Cookie", "Brownie", "Cupcake", "Donut"],
      ["Lemonade", "Soda", "Smoothie", "Milkshake"],
    ],
  },
  {
    name: "Places",
    clusters: [
      ["Library", "Bookstore", "Museum", "Gallery"],
      ["Beach", "Lagoon", "Harbor", "Pier"],
      ["Mountain", "Cliff", "Canyon", "Valley"],
      ["Airport", "Station", "Terminal", "Depot"],
      ["Hospital", "Clinic", "Pharmacy", "Lab"],
      ["School", "University", "Classroom", "Campus"],
      ["Restaurant", "Cafe", "Diner", "Bistro"],
      ["Castle", "Palace", "Fortress", "Tower"],
      ["Park", "Garden", "Forest", "Meadow"],
      ["Stadium", "Arena", "Gym", "Court"],
      ["Bank", "Office", "Factory", "Warehouse"],
      ["Hotel", "Motel", "Hostel", "Resort"],
      ["Theater", "Cinema", "Opera House", "Concert Hall"],
      ["Market", "Mall", "Bazaar", "Plaza"],
      ["Lighthouse", "Bridge", "Tunnel", "Dam"],
    ],
  },
  {
    name: "Sports & Games",
    clusters: [
      ["Soccer", "Football", "Rugby", "Hockey"],
      ["Basketball", "Volleyball", "Handball", "Netball"],
      ["Tennis", "Badminton", "Squash", "Ping Pong"],
      ["Baseball", "Cricket", "Softball", "Rounders"],
      ["Golf", "Bowling", "Darts", "Billiards"],
      ["Boxing", "Wrestling", "Judo", "Karate"],
      ["Swimming", "Diving", "Surfing", "Rowing"],
      ["Skiing", "Snowboarding", "Skating", "Sledding"],
      ["Cycling", "Running", "Marathon", "Sprint"],
      ["Chess", "Checkers", "Backgammon", "Dominoes"],
      ["Poker", "Blackjack", "Solitaire", "Rummy"],
      ["Archery", "Fencing", "Javelin", "Shot Put"],
      ["Climbing", "Hiking", "Kayaking", "Rafting"],
      ["Gymnastics", "Ballet", "Yoga", "Pilates"],
      ["Dodgeball", "Frisbee", "Kickball", "Tag"],
    ],
  },
  {
    name: "Occupations",
    clusters: [
      ["Doctor", "Nurse", "Surgeon", "Dentist"],
      ["Teacher", "Professor", "Tutor", "Principal"],
      ["Chef", "Baker", "Waiter", "Bartender"],
      ["Pilot", "Captain", "Sailor", "Astronaut"],
      ["Detective", "Firefighter", "Paramedic", "Officer"],
      ["Lawyer", "Judge", "Clerk", "Notary"],
      ["Engineer", "Architect", "Plumber", "Electrician"],
      ["Artist", "Painter", "Sculptor", "Photographer"],
      ["Musician", "Singer", "Composer", "Conductor"],
      ["Actor", "Director", "Producer", "Comedian"],
      ["Farmer", "Rancher", "Gardener", "Beekeeper"],
      ["Scientist", "Chemist", "Biologist", "Physicist"],
      ["Writer", "Editor", "Journalist", "Poet"],
      ["Mechanic", "Carpenter", "Welder", "Mason"],
      ["Banker", "Accountant", "Cashier", "Broker"],
    ],
  },
  {
    name: "Household",
    clusters: [
      ["Sofa", "Couch", "Armchair", "Recliner"],
      ["Table", "Desk", "Counter", "Shelf"],
      ["Bed", "Mattress", "Pillow", "Blanket"],
      ["Lamp", "Chandelier", "Candle", "Lantern"],
      ["Fridge", "Freezer", "Oven", "Microwave"],
      ["Kettle", "Toaster", "Blender", "Mixer"],
      ["Plate", "Bowl", "Cup", "Mug"],
      ["Fork", "Spoon", "Knife", "Chopsticks"],
      ["Broom", "Mop", "Vacuum", "Duster"],
      ["Mirror", "Clock", "Painting", "Vase"],
      ["Towel", "Soap", "Shampoo", "Toothbrush"],
      ["Curtain", "Blind", "Rug", "Carpet"],
      ["Television", "Remote", "Speaker", "Radio"],
      ["Washer", "Dryer", "Iron", "Hanger"],
      ["Drawer", "Cabinet", "Closet", "Wardrobe"],
    ],
  },
  {
    name: "Nature",
    clusters: [
      ["River", "Stream", "Lake", "Pond"],
      ["Ocean", "Sea", "Bay", "Gulf"],
      ["Mountain", "Hill", "Volcano", "Peak"],
      ["Forest", "Jungle", "Woods", "Grove"],
      ["Desert", "Dune", "Oasis", "Canyon"],
      ["Rain", "Snow", "Hail", "Sleet"],
      ["Thunder", "Lightning", "Storm", "Tornado"],
      ["Sun", "Moon", "Star", "Comet"],
      ["Cloud", "Fog", "Mist", "Rainbow"],
      ["Tree", "Bush", "Fern", "Vine"],
      ["Flower", "Rose", "Tulip", "Daisy"],
      ["Rock", "Boulder", "Pebble", "Sand"],
      ["Wind", "Breeze", "Gust", "Hurricane"],
      ["Glacier", "Iceberg", "Avalanche", "Frost"],
      ["Meadow", "Prairie", "Field", "Marsh"],
    ],
  },
  {
    name: "Entertainment",
    clusters: [
      ["Movie", "Film", "Documentary", "Trailer"],
      ["Concert", "Festival", "Gig", "Tour"],
      ["Album", "Song", "Single", "Playlist"],
      ["Novel", "Comic", "Magazine", "Poem"],
      ["Painting", "Sculpture", "Mural", "Sketch"],
      ["Guitar", "Piano", "Violin", "Drums"],
      ["Circus", "Carnival", "Parade", "Fair"],
      ["Magic", "Juggling", "Acrobatics", "Mime"],
      ["Comedy", "Drama", "Thriller", "Romance"],
      ["Cartoon", "Anime", "Sitcom", "Soap Opera"],
      ["Karaoke", "Trivia", "Bingo", "Charades"],
      ["Stage Play", "Musical", "Opera", "Ballet"],
      ["Tango", "Salsa", "Waltz", "Foxtrot"],
      ["Podcast", "Talk Show", "Newscast", "Interview"],
      ["Arcade", "Console", "Joystick", "Pinball"],
    ],
  },
  {
    name: "Travel",
    clusters: [
      ["Airplane", "Helicopter", "Jet", "Glider"],
      ["Train", "Subway", "Tram", "Monorail"],
      ["Car", "Taxi", "Bus", "Van"],
      ["Ship", "Ferry", "Yacht", "Cruise"],
      ["Bicycle", "Motorcycle", "Scooter", "Moped"],
      ["Passport", "Visa", "Ticket", "Boarding Pass"],
      ["Suitcase", "Backpack", "Luggage", "Duffel"],
      ["Hotel", "Hostel", "Resort", "Inn"],
      ["Map", "Compass", "Guidebook", "Atlas"],
      ["Island", "Coast", "Shore", "Reef"],
      ["Safari", "Tour", "Road Trip", "Expedition"],
      ["Camera", "Souvenir", "Postcard", "Keepsake"],
      ["Border", "Customs", "Embassy", "Checkpoint"],
      ["Tent", "Campfire", "Hammock", "Canteen"],
      ["Canal", "Highway", "Overpass", "Roundabout"],
    ],
  },
  {
    name: "Science & Tech",
    clusters: [
      ["Computer", "Laptop", "Tablet", "Server"],
      ["Phone", "Smartphone", "Headset", "Earbuds"],
      ["Robot", "Drone", "Android", "Cyborg"],
      ["Rocket", "Satellite", "Telescope", "Probe"],
      ["Atom", "Molecule", "Electron", "Proton"],
      ["Gravity", "Magnetism", "Friction", "Inertia"],
      ["Cell", "Gene", "Enzyme", "Microbe"],
      ["Battery", "Circuit", "Transistor", "Resistor"],
      ["Microscope", "Beaker", "Test Tube", "Pipette"],
      ["Internet", "Website", "Browser", "Email"],
      ["Algorithm", "Code", "Software", "App"],
      ["Laser", "Hologram", "Sensor", "Radar"],
      ["Planet", "Galaxy", "Nebula", "Asteroid"],
      ["Engine", "Turbine", "Motor", "Generator"],
      ["Keyboard", "Mouse", "Monitor", "Printer"],
    ],
  },
];

export const CATEGORY_NAMES: string[] = CATEGORIES.map((c) => c.name);

export interface WordPick {
  category: string;
  civilianWord: string;
  /** Only set in Decoy mode; the related word the imposter(s) receive. */
  decoyWord: string | null;
}

function randInt(n: number): number {
  return Math.floor(Math.random() * n);
}

function pickRandom<T>(arr: T[]): T {
  return arr[randInt(arr.length)];
}

function resolveCategory(name: string): Category {
  if (name === "Random") return pickRandom(CATEGORIES);
  return CATEGORIES.find((c) => c.name === name) ?? pickRandom(CATEGORIES);
}

/**
 * Pick the round's words. In Decoy mode, civilianWord and decoyWord come from
 * the same cluster (related but different). `used` tracks words already played
 * this session; picks avoid them until the pool is exhausted, then ignore it
 * (silent reset). The caller is responsible for adding the returned words to
 * `used`.
 */
export function pickWords(opts: {
  category: string;
  decoy: boolean;
  used: Set<string>;
}): WordPick {
  const category = resolveCategory(opts.category);
  const { decoy, used } = opts;

  if (decoy) {
    // Need a cluster with 2+ words. Prefer clusters with 2+ unused words.
    const usable = category.clusters.filter((c) => c.length >= 2);
    const fresh = usable.filter(
      (c) => c.filter((w) => !used.has(w)).length >= 2
    );
    const pool = fresh.length > 0 ? fresh : usable;
    const cluster = pickRandom(pool);

    // Choose two distinct words from the cluster, preferring unused ones.
    const unused = cluster.filter((w) => !used.has(w));
    const source = unused.length >= 2 ? unused : cluster.slice();
    const i = randInt(source.length);
    const civilianWord = source[i];
    const rest = source.filter((_, idx) => idx !== i);
    const decoyWord = pickRandom(rest);

    return { category: category.name, civilianWord, decoyWord };
  }

  // Classic: a single word, avoiding used words when possible.
  const allWords = category.clusters.flat();
  const fresh = allWords.filter((w) => !used.has(w));
  const source = fresh.length > 0 ? fresh : allWords;
  return {
    category: category.name,
    civilianWord: pickRandom(source),
    decoyWord: null,
  };
}
