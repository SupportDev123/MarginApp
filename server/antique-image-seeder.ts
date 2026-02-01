import { db } from './db';
import { antiqueFamilies, antiqueImages, AntiqueSeedReport } from '@shared/schema';
import { eq, sql, and, count, asc } from 'drizzle-orm';
import { downloadImage, validateImage, storeAntiqueImage } from './antique-image-storage';
import { generateImageEmbedding } from './embedding-service';
// Removed eBay API import - now using SerpAPI for image seeding to avoid rate limits

const DELAY_BETWEEN_REQUESTS_MS = 500;
const DELAY_ON_RATE_LIMIT_MS = 60000;
const IMAGES_TARGET_PER_FAMILY = 25;
const MAX_ACTIVE_FAMILIES = 15;
const MAX_LISTINGS_PER_FAMILY = 300;
const MAX_IMAGES_PER_LISTING = 3;

const JUNK_TITLE_FILTERS = [
  'for parts', 'parts only', 'damaged', 'cracked', 'chipped', 'broken',
  'as is', 'as-is', 'read description',
  'lot', 'bundle', 'wholesale', 'collection',
  'reproduction', 'repro', 'replica', 'fake',
  'modern', 'new', 'contemporary',
  'book', 'catalog', 'magazine', 'poster',
  'repair', 'needs repair', 'project'
];

const ANTIQUE_FAMILIES = [
  // Depression Glass (10)
  { brand: 'Depression Glass', family: 'Cameo', subcategory: 'glass', queueOrder: 1 },
  { brand: 'Depression Glass', family: 'American Sweetheart', subcategory: 'glass', queueOrder: 2 },
  { brand: 'Depression Glass', family: 'Cherry Blossom', subcategory: 'glass', queueOrder: 3 },
  { brand: 'Depression Glass', family: 'Royal Lace', subcategory: 'glass', queueOrder: 4 },
  { brand: 'Depression Glass', family: 'Miss America', subcategory: 'glass', queueOrder: 5 },
  { brand: 'Depression Glass', family: 'Mayfair', subcategory: 'glass', queueOrder: 6 },
  { brand: 'Depression Glass', family: 'Sharon', subcategory: 'glass', queueOrder: 7 },
  { brand: 'Depression Glass', family: 'Adam', subcategory: 'glass', queueOrder: 8 },
  { brand: 'Depression Glass', family: 'Princess', subcategory: 'glass', queueOrder: 9 },
  { brand: 'Depression Glass', family: 'Iris', subcategory: 'glass', queueOrder: 10 },
  
  // Hummel Figurines (10)
  { brand: 'Hummel', family: 'Apple Tree Boy', subcategory: 'pottery', queueOrder: 11 },
  { brand: 'Hummel', family: 'Apple Tree Girl', subcategory: 'pottery', queueOrder: 12 },
  { brand: 'Hummel', family: 'Umbrella Boy', subcategory: 'pottery', queueOrder: 13 },
  { brand: 'Hummel', family: 'Umbrella Girl', subcategory: 'pottery', queueOrder: 14 },
  { brand: 'Hummel', family: 'Merry Wanderer', subcategory: 'pottery', queueOrder: 15 },
  { brand: 'Hummel', family: 'School Boy', subcategory: 'pottery', queueOrder: 16 },
  { brand: 'Hummel', family: 'Stormy Weather', subcategory: 'pottery', queueOrder: 17 },
  { brand: 'Hummel', family: 'Ride Into Christmas', subcategory: 'pottery', queueOrder: 18 },
  { brand: 'Hummel', family: 'Ring Around Rosie', subcategory: 'pottery', queueOrder: 19 },
  { brand: 'Hummel', family: 'Adventure Bound', subcategory: 'pottery', queueOrder: 20 },
  
  // McCoy Pottery (8)
  { brand: 'McCoy', family: 'Cookie Jar', subcategory: 'pottery', queueOrder: 21 },
  { brand: 'McCoy', family: 'Planter', subcategory: 'pottery', queueOrder: 22 },
  { brand: 'McCoy', family: 'Vase', subcategory: 'pottery', queueOrder: 23 },
  { brand: 'McCoy', family: 'Jardiniere', subcategory: 'pottery', queueOrder: 24 },
  { brand: 'McCoy', family: 'Flower Pot', subcategory: 'pottery', queueOrder: 25 },
  { brand: 'McCoy', family: 'Mammy Cookie Jar', subcategory: 'pottery', queueOrder: 26 },
  { brand: 'McCoy', family: 'Loy-Nel-Art', subcategory: 'pottery', queueOrder: 27 },
  { brand: 'McCoy', family: 'El Rancho', subcategory: 'pottery', queueOrder: 28 },
  
  // Fenton Glass (8)
  { brand: 'Fenton', family: 'Hobnail', subcategory: 'glass', queueOrder: 29 },
  { brand: 'Fenton', family: 'Carnival Glass', subcategory: 'glass', queueOrder: 30 },
  { brand: 'Fenton', family: 'Milk Glass', subcategory: 'glass', queueOrder: 31 },
  { brand: 'Fenton', family: 'Burmese', subcategory: 'glass', queueOrder: 32 },
  { brand: 'Fenton', family: 'Cranberry', subcategory: 'glass', queueOrder: 33 },
  { brand: 'Fenton', family: 'Coin Dot', subcategory: 'glass', queueOrder: 34 },
  { brand: 'Fenton', family: 'Silver Crest', subcategory: 'glass', queueOrder: 35 },
  { brand: 'Fenton', family: 'Rose Overlay', subcategory: 'glass', queueOrder: 36 },
  
  // Roseville Pottery (10)
  { brand: 'Roseville', family: 'Futura', subcategory: 'pottery', queueOrder: 37 },
  { brand: 'Roseville', family: 'Pinecone', subcategory: 'pottery', queueOrder: 38 },
  { brand: 'Roseville', family: 'Sunflower', subcategory: 'pottery', queueOrder: 39 },
  { brand: 'Roseville', family: 'Jonquil', subcategory: 'pottery', queueOrder: 40 },
  { brand: 'Roseville', family: 'Blackberry', subcategory: 'pottery', queueOrder: 41 },
  { brand: 'Roseville', family: 'Wisteria', subcategory: 'pottery', queueOrder: 42 },
  { brand: 'Roseville', family: 'Della Robbia', subcategory: 'pottery', queueOrder: 43 },
  { brand: 'Roseville', family: 'Baneda', subcategory: 'pottery', queueOrder: 44 },
  { brand: 'Roseville', family: 'Morning Glory', subcategory: 'pottery', queueOrder: 45 },
  { brand: 'Roseville', family: 'Ferella', subcategory: 'pottery', queueOrder: 46 },
  
  // Sterling Silver Flatware (10)
  { brand: 'Gorham', family: 'Chantilly', subcategory: 'silver', queueOrder: 47 },
  { brand: 'Gorham', family: 'Buttercup', subcategory: 'silver', queueOrder: 48 },
  { brand: 'Wallace', family: 'Grande Baroque', subcategory: 'silver', queueOrder: 49 },
  { brand: 'Reed & Barton', family: 'Francis I', subcategory: 'silver', queueOrder: 50 },
  { brand: 'Towle', family: 'Old Master', subcategory: 'silver', queueOrder: 51 },
  { brand: 'International', family: 'Royal Danish', subcategory: 'silver', queueOrder: 52 },
  { brand: 'Lunt', family: 'Eloquence', subcategory: 'silver', queueOrder: 53 },
  { brand: 'Kirk Stieff', family: 'Repousse', subcategory: 'silver', queueOrder: 54 },
  { brand: 'Tiffany', family: 'Chrysanthemum', subcategory: 'silver', queueOrder: 55 },
  { brand: 'Georg Jensen', family: 'Acorn', subcategory: 'silver', queueOrder: 56 },
  
  // Vintage Jewelry (12)
  { brand: 'Trifari', family: 'Jelly Belly', subcategory: 'jewelry', queueOrder: 57 },
  { brand: 'Weiss', family: 'Rhinestone Brooch', subcategory: 'jewelry', queueOrder: 58 },
  { brand: 'Eisenberg', family: 'Ice Brooch', subcategory: 'jewelry', queueOrder: 59 },
  { brand: 'Miriam Haskell', family: 'Baroque Pearl', subcategory: 'jewelry', queueOrder: 60 },
  { brand: 'Coro', family: 'Duette', subcategory: 'jewelry', queueOrder: 61 },
  { brand: 'Schreiner', family: 'Inverted Stone', subcategory: 'jewelry', queueOrder: 62 },
  { brand: 'Juliana', family: 'DeLizza Elster', subcategory: 'jewelry', queueOrder: 63 },
  { brand: 'Kramer', family: 'Aurora Borealis', subcategory: 'jewelry', queueOrder: 64 },
  { brand: 'Boucher', family: 'Enamel', subcategory: 'jewelry', queueOrder: 65 },
  { brand: 'Hattie Carnegie', family: 'Figural', subcategory: 'jewelry', queueOrder: 66 },
  { brand: 'Kenneth Jay Lane', family: 'Vintage', subcategory: 'jewelry', queueOrder: 67 },
  { brand: 'Bakelite', family: 'Bangle', subcategory: 'jewelry', queueOrder: 68 },
  
  // Carnival Glass (8)
  { brand: 'Carnival Glass', family: 'Grape and Cable', subcategory: 'glass', queueOrder: 69 },
  { brand: 'Carnival Glass', family: 'Peacock at Fountain', subcategory: 'glass', queueOrder: 70 },
  { brand: 'Carnival Glass', family: 'Good Luck', subcategory: 'glass', queueOrder: 71 },
  { brand: 'Carnival Glass', family: 'Stag and Holly', subcategory: 'glass', queueOrder: 72 },
  { brand: 'Carnival Glass', family: 'Farmyard', subcategory: 'glass', queueOrder: 73 },
  { brand: 'Carnival Glass', family: 'Dragon and Lotus', subcategory: 'glass', queueOrder: 74 },
  { brand: 'Carnival Glass', family: 'Persian Medallion', subcategory: 'glass', queueOrder: 75 },
  { brand: 'Carnival Glass', family: 'Acorn Burrs', subcategory: 'glass', queueOrder: 76 },
  
  // Fiesta Ware (8)
  { brand: 'Fiesta', family: 'Disc Pitcher', subcategory: 'pottery', queueOrder: 77 },
  { brand: 'Fiesta', family: 'Mixing Bowl', subcategory: 'pottery', queueOrder: 78 },
  { brand: 'Fiesta', family: 'Carafe', subcategory: 'pottery', queueOrder: 79 },
  { brand: 'Fiesta', family: 'Covered Onion Soup', subcategory: 'pottery', queueOrder: 80 },
  { brand: 'Fiesta', family: 'Cake Plate', subcategory: 'pottery', queueOrder: 81 },
  { brand: 'Fiesta', family: 'Bud Vase', subcategory: 'pottery', queueOrder: 82 },
  { brand: 'Fiesta', family: 'Syrup Pitcher', subcategory: 'pottery', queueOrder: 83 },
  { brand: 'Fiesta', family: 'Demitasse Cup', subcategory: 'pottery', queueOrder: 84 },
  
  // Antique Clocks (12)
  { brand: 'Seth Thomas', family: 'Mantel Clock', subcategory: 'clocks', queueOrder: 85 },
  { brand: 'Seth Thomas', family: 'Regulator', subcategory: 'clocks', queueOrder: 86 },
  { brand: 'Ansonia', family: 'Mantel Clock', subcategory: 'clocks', queueOrder: 87 },
  { brand: 'Ansonia', family: 'Crystal Regulator', subcategory: 'clocks', queueOrder: 88 },
  { brand: 'Gilbert', family: 'Mantel Clock', subcategory: 'clocks', queueOrder: 89 },
  { brand: 'Waterbury', family: 'Mantel Clock', subcategory: 'clocks', queueOrder: 90 },
  { brand: 'New Haven', family: 'Banjo Clock', subcategory: 'clocks', queueOrder: 91 },
  { brand: 'E. Howard', family: 'Wall Clock', subcategory: 'clocks', queueOrder: 92 },
  { brand: 'Sessions', family: 'Mantel Clock', subcategory: 'clocks', queueOrder: 93 },
  { brand: 'Atmos', family: 'Jaeger LeCoultre', subcategory: 'clocks', queueOrder: 94 },
  { brand: 'Chelsea', family: 'Ships Clock', subcategory: 'clocks', queueOrder: 95 },
  { brand: 'Black Forest', family: 'Cuckoo Clock', subcategory: 'clocks', queueOrder: 96 },
  
  // Antique Lamps (12)
  { brand: 'Tiffany', family: 'Dragonfly', subcategory: 'lamps', queueOrder: 97 },
  { brand: 'Tiffany', family: 'Wisteria', subcategory: 'lamps', queueOrder: 98 },
  { brand: 'Tiffany', family: 'Favrile', subcategory: 'lamps', queueOrder: 99 },
  { brand: 'Handel', family: 'Reverse Painted', subcategory: 'lamps', queueOrder: 100 },
  { brand: 'Handel', family: 'Teroma', subcategory: 'lamps', queueOrder: 101 },
  { brand: 'Pairpoint', family: 'Puffy', subcategory: 'lamps', queueOrder: 102 },
  { brand: 'Bradley Hubbard', family: 'Slag Glass', subcategory: 'lamps', queueOrder: 103 },
  { brand: 'Aladdin', family: 'Kerosene Lamp', subcategory: 'lamps', queueOrder: 104 },
  { brand: 'GWTW', family: 'Gone With The Wind', subcategory: 'lamps', queueOrder: 105 },
  { brand: 'Banquet Lamp', family: 'Victorian', subcategory: 'lamps', queueOrder: 106 },
  { brand: 'Jefferson', family: 'Reverse Painted', subcategory: 'lamps', queueOrder: 107 },
  { brand: 'Pittsburgh', family: 'Reverse Painted', subcategory: 'lamps', queueOrder: 108 },
  
  // Cast Iron (10)
  { brand: 'Griswold', family: 'Skillet', subcategory: 'cast_iron', queueOrder: 109 },
  { brand: 'Griswold', family: 'Dutch Oven', subcategory: 'cast_iron', queueOrder: 110 },
  { brand: 'Wagner', family: 'Skillet', subcategory: 'cast_iron', queueOrder: 111 },
  { brand: 'Wagner', family: 'Dutch Oven', subcategory: 'cast_iron', queueOrder: 112 },
  { brand: 'Lodge', family: 'Vintage Skillet', subcategory: 'cast_iron', queueOrder: 113 },
  { brand: 'Hubley', family: 'Doorstop', subcategory: 'cast_iron', queueOrder: 114 },
  { brand: 'Hubley', family: 'Toy Car', subcategory: 'cast_iron', queueOrder: 115 },
  { brand: 'Arcade', family: 'Toy Truck', subcategory: 'cast_iron', queueOrder: 116 },
  { brand: 'Kenton', family: 'Toy Bank', subcategory: 'cast_iron', queueOrder: 117 },
  { brand: 'Kilgore', family: 'Cap Gun', subcategory: 'cast_iron', queueOrder: 118 },
  
  // Vintage Toys (15)
  { brand: 'Buddy L', family: 'Pressed Steel Truck', subcategory: 'toys', queueOrder: 119 },
  { brand: 'Marx', family: 'Tin Toy', subcategory: 'toys', queueOrder: 120 },
  { brand: 'Lionel', family: 'Train Set', subcategory: 'toys', queueOrder: 121 },
  { brand: 'American Flyer', family: 'Train Set', subcategory: 'toys', queueOrder: 122 },
  { brand: 'Ives', family: 'Train', subcategory: 'toys', queueOrder: 123 },
  { brand: 'Structo', family: 'Truck', subcategory: 'toys', queueOrder: 124 },
  { brand: 'Tonka', family: 'Vintage Truck', subcategory: 'toys', queueOrder: 125 },
  { brand: 'Steiff', family: 'Teddy Bear', subcategory: 'toys', queueOrder: 126 },
  { brand: 'Steiff', family: 'Animal', subcategory: 'toys', queueOrder: 127 },
  { brand: 'Marklin', family: 'Train', subcategory: 'toys', queueOrder: 128 },
  { brand: 'Schuco', family: 'Wind Up', subcategory: 'toys', queueOrder: 129 },
  { brand: 'Lehmann', family: 'Tin Toy', subcategory: 'toys', queueOrder: 130 },
  { brand: 'Bing', family: 'Train', subcategory: 'toys', queueOrder: 131 },
  { brand: 'Corgi', family: 'Vintage Diecast', subcategory: 'toys', queueOrder: 132 },
  { brand: 'Dinky', family: 'Vintage Diecast', subcategory: 'toys', queueOrder: 133 },
  
  // Vintage Advertising (10)
  { brand: 'Coca Cola', family: 'Tray', subcategory: 'advertising', queueOrder: 134 },
  { brand: 'Coca Cola', family: 'Sign', subcategory: 'advertising', queueOrder: 135 },
  { brand: 'Coca Cola', family: 'Thermometer', subcategory: 'advertising', queueOrder: 136 },
  { brand: 'Pepsi', family: 'Sign', subcategory: 'advertising', queueOrder: 137 },
  { brand: 'Gas Oil', family: 'Porcelain Sign', subcategory: 'advertising', queueOrder: 138 },
  { brand: 'Texaco', family: 'Sign', subcategory: 'advertising', queueOrder: 139 },
  { brand: 'Shell', family: 'Sign', subcategory: 'advertising', queueOrder: 140 },
  { brand: 'Mobil', family: 'Pegasus Sign', subcategory: 'advertising', queueOrder: 141 },
  { brand: 'Neon', family: 'Beer Sign', subcategory: 'advertising', queueOrder: 142 },
  { brand: 'Tobacco', family: 'Tin Sign', subcategory: 'advertising', queueOrder: 143 },
  
  // Art Pottery (12)
  { brand: 'Weller', family: 'Louwelsa', subcategory: 'pottery', queueOrder: 144 },
  { brand: 'Weller', family: 'Sicardo', subcategory: 'pottery', queueOrder: 145 },
  { brand: 'Rookwood', family: 'Vase', subcategory: 'pottery', queueOrder: 146 },
  { brand: 'Rookwood', family: 'Vellum', subcategory: 'pottery', queueOrder: 147 },
  { brand: 'Grueby', family: 'Vase', subcategory: 'pottery', queueOrder: 148 },
  { brand: 'Teco', family: 'Vase', subcategory: 'pottery', queueOrder: 149 },
  { brand: 'Van Briggle', family: 'Vase', subcategory: 'pottery', queueOrder: 150 },
  { brand: 'Fulper', family: 'Vase', subcategory: 'pottery', queueOrder: 151 },
  { brand: 'Newcomb College', family: 'Pottery', subcategory: 'pottery', queueOrder: 152 },
  { brand: 'Marblehead', family: 'Pottery', subcategory: 'pottery', queueOrder: 153 },
  { brand: 'Saturday Evening Girls', family: 'Pottery', subcategory: 'pottery', queueOrder: 154 },
  { brand: 'Overbeck', family: 'Pottery', subcategory: 'pottery', queueOrder: 155 },
  
  // Antique Furniture (10)
  { brand: 'Stickley', family: 'Mission Oak', subcategory: 'furniture', queueOrder: 156 },
  { brand: 'Gustav Stickley', family: 'Craftsman', subcategory: 'furniture', queueOrder: 157 },
  { brand: 'L&JG Stickley', family: 'Arts Crafts', subcategory: 'furniture', queueOrder: 158 },
  { brand: 'Limbert', family: 'Arts Crafts', subcategory: 'furniture', queueOrder: 159 },
  { brand: 'Roycroft', family: 'Mission', subcategory: 'furniture', queueOrder: 160 },
  { brand: 'Heywood Wakefield', family: 'Mid Century', subcategory: 'furniture', queueOrder: 161 },
  { brand: 'Eames', family: 'Lounge Chair', subcategory: 'furniture', queueOrder: 162 },
  { brand: 'Herman Miller', family: 'Mid Century', subcategory: 'furniture', queueOrder: 163 },
  { brand: 'Knoll', family: 'Mid Century', subcategory: 'furniture', queueOrder: 164 },
  { brand: 'Hoosier', family: 'Cabinet', subcategory: 'furniture', queueOrder: 165 },
  
  // Art Deco (8)
  { brand: 'Art Deco', family: 'Frankart', subcategory: 'decorative', queueOrder: 166 },
  { brand: 'Art Deco', family: 'Chase Chrome', subcategory: 'decorative', queueOrder: 167 },
  { brand: 'Art Deco', family: 'Ronson Lighter', subcategory: 'decorative', queueOrder: 168 },
  { brand: 'Art Deco', family: 'Bronze Figure', subcategory: 'decorative', queueOrder: 169 },
  { brand: 'Art Deco', family: 'Lalique', subcategory: 'decorative', queueOrder: 170 },
  { brand: 'Art Deco', family: 'Erté Bronze', subcategory: 'decorative', queueOrder: 171 },
  { brand: 'Art Deco', family: 'Chiparus', subcategory: 'decorative', queueOrder: 172 },
  { brand: 'Art Deco', family: 'Preiss', subcategory: 'decorative', queueOrder: 173 },
  
  // Royal Doulton (8)
  { brand: 'Royal Doulton', family: 'Character Jug', subcategory: 'pottery', queueOrder: 174 },
  { brand: 'Royal Doulton', family: 'Figurine', subcategory: 'pottery', queueOrder: 175 },
  { brand: 'Royal Doulton', family: 'Toby Jug', subcategory: 'pottery', queueOrder: 176 },
  { brand: 'Royal Doulton', family: 'Series Ware', subcategory: 'pottery', queueOrder: 177 },
  { brand: 'Royal Doulton', family: 'Bunnykins', subcategory: 'pottery', queueOrder: 178 },
  { brand: 'Royal Doulton', family: 'Flambe', subcategory: 'pottery', queueOrder: 179 },
  { brand: 'Royal Doulton', family: 'Stoneware', subcategory: 'pottery', queueOrder: 180 },
  { brand: 'Royal Doulton', family: 'Lambeth', subcategory: 'pottery', queueOrder: 181 },
  
  // Limoges & Fine China (10)
  { brand: 'Limoges', family: 'Hand Painted', subcategory: 'china', queueOrder: 182 },
  { brand: 'Haviland', family: 'Limoges', subcategory: 'china', queueOrder: 183 },
  { brand: 'RS Prussia', family: 'Bowl', subcategory: 'china', queueOrder: 184 },
  { brand: 'RS Prussia', family: 'Chocolate Set', subcategory: 'china', queueOrder: 185 },
  { brand: 'Nippon', family: 'Hand Painted', subcategory: 'china', queueOrder: 186 },
  { brand: 'Noritake', family: 'Art Deco', subcategory: 'china', queueOrder: 187 },
  { brand: 'Royal Bayreuth', family: 'Figural', subcategory: 'china', queueOrder: 188 },
  { brand: 'Royal Vienna', family: 'Portrait', subcategory: 'china', queueOrder: 189 },
  { brand: 'Meissen', family: 'Figurine', subcategory: 'china', queueOrder: 190 },
  { brand: 'Dresden', family: 'Lace Figure', subcategory: 'china', queueOrder: 191 },
  
  // Stoneware & Crocks (8)
  { brand: 'Red Wing', family: 'Crock', subcategory: 'stoneware', queueOrder: 192 },
  { brand: 'Red Wing', family: 'Jug', subcategory: 'stoneware', queueOrder: 193 },
  { brand: 'Western Stoneware', family: 'Crock', subcategory: 'stoneware', queueOrder: 194 },
  { brand: 'Bennington', family: 'Pottery', subcategory: 'stoneware', queueOrder: 195 },
  { brand: 'Salt Glaze', family: 'Crock', subcategory: 'stoneware', queueOrder: 196 },
  { brand: 'Cobalt Decorated', family: 'Crock', subcategory: 'stoneware', queueOrder: 197 },
  { brand: 'Spongeware', family: 'Bowl', subcategory: 'stoneware', queueOrder: 198 },
  { brand: 'Yellowware', family: 'Bowl', subcategory: 'stoneware', queueOrder: 199 },
  
  // Flow Blue (6)
  { brand: 'Flow Blue', family: 'Scinde', subcategory: 'china', queueOrder: 200 },
  { brand: 'Flow Blue', family: 'Touraine', subcategory: 'china', queueOrder: 201 },
  { brand: 'Flow Blue', family: 'La Belle', subcategory: 'china', queueOrder: 202 },
  { brand: 'Flow Blue', family: 'Hong Kong', subcategory: 'china', queueOrder: 203 },
  { brand: 'Flow Blue', family: 'Chapoo', subcategory: 'china', queueOrder: 204 },
  { brand: 'Flow Blue', family: 'Fairy Villas', subcategory: 'china', queueOrder: 205 },
];

interface EbayItemSummary {
  itemId: string;
  title: string;
  condition?: string;
  image?: { imageUrl: string };
  additionalImages?: Array<{ imageUrl: string }>;
  price?: { value: string; currency: string };
}

interface EbaySearchResponse {
  itemSummaries?: EbayItemSummary[];
  total?: number;
  offset?: number;
  limit?: number;
  next?: string;
}

interface FamilySeederResult {
  brand: string;
  family: string;
  subcategory: string;
  imagesStored: number;
  listingsScanned: number;
  apiCalls: number;
  duplicatesSkipped: number;
  downloadFailed: number;
  junkFiltered: number;
  completed: boolean;
  status: 'locked' | 'active' | 'hard';
}

interface SeederStats {
  lockedFamilies: FamilySeederResult[];
  activeFamilies: FamilySeederResult[];
  hardFamilies: FamilySeederResult[];
  queuedFamilies: Array<{ brand: string; family: string; subcategory: string }>;
  totalApiCalls: number;
  totalImagesStored: number;
  totalDownloadSuccess: number;
  totalDownloadFailed: number;
  failureReasons: Map<string, number>;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isJunkTitle(title: string): boolean {
  const lowerTitle = title.toLowerCase();
  return JUNK_TITLE_FILTERS.some(filter => {
    if (filter.includes(' ')) {
      return lowerTitle.includes(filter);
    }
    const words = lowerTitle.split(/[\s,.-]+/);
    return words.includes(filter);
  });
}

async function searchSerpApiImages(
  query: string
): Promise<{ images: Array<{ url: string; title: string }>; apiCalled: boolean }> {
  const serpApiKey = process.env.SERPAPI_KEY;
  
  if (!serpApiKey) {
    console.log('    SerpAPI key not configured');
    return { images: [], apiCalled: false };
  }

  // Search for antique images via SerpAPI Google Images
  const searchQuery = `${query} antique vintage`;
  const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(searchQuery)}&num=20&api_key=${serpApiKey}`;

  try {
    const response = await fetch(url);

    if (response.status === 429 || response.status === 503) {
      console.log(`    SerpAPI rate limited (${response.status}), waiting ${DELAY_ON_RATE_LIMIT_MS / 1000}s...`);
      await delay(DELAY_ON_RATE_LIMIT_MS);
      return { images: [], apiCalled: true };
    }

    if (!response.ok) {
      console.log(`    SerpAPI error: ${response.status}`);
      return { images: [], apiCalled: true };
    }

    const data = await response.json();
    const images: Array<{ url: string; title: string }> = [];
    
    if (data.images_results) {
      for (const img of data.images_results) {
        if (img.original && img.title) {
          images.push({ url: img.original, title: img.title });
        }
      }
    }

    console.log(`    SerpAPI returned ${images.length} images`);
    return { images, apiCalled: true };
  } catch (error: any) {
    console.log(`    SerpAPI exception: ${error.message}`);
    return { images: [], apiCalled: true };
  }
}

// processAntiqueItem removed - now using SerpAPI inline processing

async function seedSingleAntiqueFamily(
  family: typeof antiqueFamilies.$inferSelect,
  failureReasons: Map<string, number>
): Promise<FamilySeederResult> {
  const { id: familyId, brand, family: familyName, subcategory, listingsScanned: previouslyScanned } = family;
  
  const result: FamilySeederResult = {
    brand,
    family: familyName,
    subcategory,
    imagesStored: 0,
    listingsScanned: previouslyScanned,
    apiCalls: 0,
    duplicatesSkipped: 0,
    downloadFailed: 0,
    junkFiltered: 0,
    completed: false,
    status: 'active',
  };

  const imageCountResult = await db
    .select({ count: count() })
    .from(antiqueImages)
    .where(eq(antiqueImages.familyId, familyId));
  
  let currentImageCount = Number(imageCountResult[0]?.count || 0);

  if (currentImageCount >= IMAGES_TARGET_PER_FAMILY) {
    await db.update(antiqueFamilies)
      .set({ status: 'locked', updatedAt: new Date() })
      .where(eq(antiqueFamilies.id, familyId));
    
    console.log(`  [${brand} ${familyName}] Already complete: ${currentImageCount}/${IMAGES_TARGET_PER_FAMILY} images`);
    result.completed = true;
    result.status = 'locked';
    return result;
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`SEEDING ANTIQUES: ${brand} ${familyName}`);
  console.log(`Current: ${currentImageCount}/${IMAGES_TARGET_PER_FAMILY} images`);
  console.log(`Listings scanned so far: ${result.listingsScanned}/${MAX_LISTINGS_PER_FAMILY}`);
  console.log(`${'─'.repeat(50)}`);

  const existingSha256s = new Set<string>();
  const existingImages = await db
    .select({ sha256: antiqueImages.sha256 })
    .from(antiqueImages)
    .where(eq(antiqueImages.familyId, familyId));
  existingImages.forEach(img => existingSha256s.add(img.sha256));

  const searchTerms = [
    `${brand} ${familyName}`,
    `${familyName}`,
    `${brand} ${familyName} collectible`,
  ];

  for (const query of searchTerms) {
    if (currentImageCount >= IMAGES_TARGET_PER_FAMILY) break;

    console.log(`  Query: "${query}"`);

    const { images, apiCalled } = await searchSerpApiImages(query);
    if (apiCalled) result.apiCalls++;

    if (!images || images.length === 0) {
      console.log(`    No images found for this query`);
      continue;
    }

    console.log(`    Processing ${images.length} images from SerpAPI...`);

    for (const img of images) {
      if (currentImageCount >= IMAGES_TARGET_PER_FAMILY) break;

      result.listingsScanned++;
      
      if (isJunkTitle(img.title)) {
        result.junkFiltered++;
        continue;
      }

      try {
        const imageBuffer = await downloadImage(img.url);
        if (!imageBuffer) {
          result.downloadFailed++;
          continue;
        }

        const validation = await validateImage(imageBuffer);
        if (!validation.valid) {
          result.downloadFailed++;
          continue;
        }

        if (existingSha256s.has(validation.sha256!)) {
          result.duplicatesSkipped++;
          continue;
        }

        const embeddingVector = await generateImageEmbedding(imageBuffer);
        if (!embeddingVector) {
          result.downloadFailed++;
          continue;
        }

        const storeResult = await storeAntiqueImage(imageBuffer, validation.sha256!, brand, familyName, familyId);
        if (!storeResult) {
          result.downloadFailed++;
          continue;
        }

        await db.insert(antiqueImages).values({
          familyId,
          storagePath: storeResult.storagePath,
          originalUrl: img.url,
          sha256: validation.sha256!,
          contentType: storeResult.contentType,
          fileSize: storeResult.fileSize,
          width: storeResult.width,
          height: storeResult.height,
          qualityScore: '0.5',
          embedding: sql`${JSON.stringify(embeddingVector)}::vector`,
          source: 'serpapi',
        });

        existingSha256s.add(validation.sha256!);
        result.imagesStored++;
        currentImageCount++;
        console.log(`    + 1 image (now ${currentImageCount}/${IMAGES_TARGET_PER_FAMILY})`);
      } catch (error: any) {
        result.downloadFailed++;
      }

      await delay(DELAY_BETWEEN_REQUESTS_MS);
    }

    await db.update(antiqueFamilies)
      .set({ listingsScanned: result.listingsScanned, updatedAt: new Date() })
      .where(eq(antiqueFamilies.id, familyId));
  }

  if (currentImageCount >= IMAGES_TARGET_PER_FAMILY) {
    result.completed = true;
    result.status = 'locked';
    console.log(`  LOCKED: Reached ${IMAGES_TARGET_PER_FAMILY} images`);
  } else if (result.listingsScanned >= MAX_LISTINGS_PER_FAMILY) {
    result.status = 'hard';
    console.log(`  HARD STOP: Scanned ${MAX_LISTINGS_PER_FAMILY} listings but only got ${currentImageCount} images`);
  } else {
    result.status = 'active';
  }
  
  await db.update(antiqueFamilies)
    .set({ 
      status: result.status, 
      listingsScanned: result.listingsScanned,
      updatedAt: new Date() 
    })
    .where(eq(antiqueFamilies.id, familyId));

  console.log(`\n  RESULT: ${result.status.toUpperCase()}`);
  console.log(`  Images: ${currentImageCount}/${IMAGES_TARGET_PER_FAMILY}`);
  console.log(`  Listings scanned: ${result.listingsScanned}`);
  console.log(`  Junk filtered: ${result.junkFiltered}`);
  console.log(`  Duplicates: ${result.duplicatesSkipped}`);

  return result;
}

export async function initializeAntiqueFamilies(): Promise<void> {
  console.log('Initializing antique families...');
  
  for (const family of ANTIQUE_FAMILIES) {
    const existing = await db
      .select()
      .from(antiqueFamilies)
      .where(and(
        eq(antiqueFamilies.brand, family.brand),
        eq(antiqueFamilies.family, family.family)
      ))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(antiqueFamilies).values({
        brand: family.brand,
        family: family.family,
        displayName: `${family.brand} ${family.family}`,
        subcategory: family.subcategory,
        queueOrder: family.queueOrder,
        status: family.queueOrder <= MAX_ACTIVE_FAMILIES ? 'active' : 'queued',
      });
      console.log(`  Created: ${family.brand} ${family.family}`);
    }
  }
  
  console.log(`Antique families initialized: ${ANTIQUE_FAMILIES.length} total`);
}

export async function runAntiqueImageSeeder(): Promise<SeederStats> {
  const stats: SeederStats = {
    lockedFamilies: [],
    activeFamilies: [],
    hardFamilies: [],
    queuedFamilies: [],
    totalApiCalls: 0,
    totalImagesStored: 0,
    totalDownloadSuccess: 0,
    totalDownloadFailed: 0,
    failureReasons: new Map(),
  };

  await initializeAntiqueFamilies();

  console.log('='.repeat(60));
  console.log('ANTIQUE IMAGE SEEDER v1.0 - FILL-FIRST MODE');
  console.log('='.repeat(60));
  console.log(`Target: ${IMAGES_TARGET_PER_FAMILY} images per family`);
  console.log(`Max active families: ${MAX_ACTIVE_FAMILIES}`);
  console.log(`Max listings per family: ${MAX_LISTINGS_PER_FAMILY}`);
  console.log(`Max images per listing: ${MAX_IMAGES_PER_LISTING}`);
  console.log(`Title filtering: ENABLED`);
  console.log('='.repeat(60));

  while (true) {
    const activeFamilies = await db
      .select()
      .from(antiqueFamilies)
      .where(eq(antiqueFamilies.status, 'active'))
      .orderBy(asc(antiqueFamilies.queueOrder));

    if (activeFamilies.length === 0) {
      const queuedFamilies = await db
        .select()
        .from(antiqueFamilies)
        .where(eq(antiqueFamilies.status, 'queued'))
        .orderBy(asc(antiqueFamilies.queueOrder))
        .limit(MAX_ACTIVE_FAMILIES);

      if (queuedFamilies.length === 0) {
        console.log('\nNo more families to process.');
        break;
      }

      for (const family of queuedFamilies) {
        await db.update(antiqueFamilies)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(antiqueFamilies.id, family.id));
      }

      console.log(`\nActivated ${queuedFamilies.length} new families from queue.`);
      continue;
    }

    const family = activeFamilies[0];
    console.log(`\nProcessing: ${family.brand} ${family.family} (queue order: ${family.queueOrder})`);

    const result = await seedSingleAntiqueFamily(family, stats.failureReasons);
    
    stats.totalApiCalls += result.apiCalls;
    stats.totalImagesStored += result.imagesStored;
    stats.totalDownloadFailed += result.downloadFailed;
    stats.totalDownloadSuccess += result.imagesStored;

    if (result.status === 'locked') {
      stats.lockedFamilies.push(result);
      
      const nextQueued = await db
        .select()
        .from(antiqueFamilies)
        .where(eq(antiqueFamilies.status, 'queued'))
        .orderBy(asc(antiqueFamilies.queueOrder))
        .limit(1);

      if (nextQueued.length > 0) {
        await db.update(antiqueFamilies)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(antiqueFamilies.id, nextQueued[0].id));
        console.log(`  Activated next family: ${nextQueued[0].brand} ${nextQueued[0].family}`);
      }
    } else if (result.status === 'hard') {
      stats.hardFamilies.push(result);
      
      const nextQueued = await db
        .select()
        .from(antiqueFamilies)
        .where(eq(antiqueFamilies.status, 'queued'))
        .orderBy(asc(antiqueFamilies.queueOrder))
        .limit(1);

      if (nextQueued.length > 0) {
        await db.update(antiqueFamilies)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(antiqueFamilies.id, nextQueued[0].id));
        console.log(`  Activated next family: ${nextQueued[0].brand} ${nextQueued[0].family}`);
      }
    } else {
      stats.activeFamilies.push(result);
    }

    await delay(2000);
  }

  const remainingQueued = await db
    .select({ brand: antiqueFamilies.brand, family: antiqueFamilies.family, subcategory: antiqueFamilies.subcategory })
    .from(antiqueFamilies)
    .where(eq(antiqueFamilies.status, 'queued'))
    .orderBy(asc(antiqueFamilies.queueOrder));
  
  stats.queuedFamilies = remainingQueued;

  printSeederReport(stats);
  
  return stats;
}

function printSeederReport(stats: SeederStats): void {
  console.log('\n' + '='.repeat(60));
  console.log('ANTIQUE SEEDER REPORT');
  console.log('='.repeat(60));
  
  console.log('\nA) LOCKED FAMILIES:');
  console.log('-'.repeat(50));
  if (stats.lockedFamilies.length === 0) {
    console.log('  (none)');
  } else {
    console.log('  family_name | image_count | status');
    for (const f of stats.lockedFamilies) {
      console.log(`  ${f.brand} ${f.family} | ${f.imagesStored} | LOCKED`);
    }
  }

  console.log('\nB) ACTIVE / QUEUED FAMILIES:');
  console.log('-'.repeat(50));
  console.log('  family_name | image_count | status');
  for (const f of stats.activeFamilies) {
    console.log(`  ${f.brand} ${f.family} | ${f.imagesStored} | ACTIVE`);
  }
  for (const f of stats.queuedFamilies) {
    console.log(`  ${f.brand} ${f.family} | 0 | QUEUED`);
  }

  console.log('\nC) HARD FAMILIES (if any):');
  console.log('-'.repeat(50));
  if (stats.hardFamilies.length === 0) {
    console.log('  (none)');
  } else {
    console.log('  family_name | image_count | listings_scanned');
    for (const f of stats.hardFamilies) {
      console.log(`  ${f.brand} ${f.family} | ${f.imagesStored} | ${f.listingsScanned}`);
    }
  }

  console.log('\nD) GLOBAL STATS:');
  console.log('-'.repeat(50));
  console.log(`  Total antique images stored: ${stats.totalImagesStored}`);
  console.log(`  Total families LOCKED: ${stats.lockedFamilies.length}`);
  console.log(`  Total families ACTIVE: ${stats.activeFamilies.length}`);
  console.log(`  Total families HARD: ${stats.hardFamilies.length}`);
  console.log(`  API calls made: ${stats.totalApiCalls}`);
  console.log(`  Image download success: ${stats.totalDownloadSuccess}`);
  console.log(`  Image download failed: ${stats.totalDownloadFailed}`);
  
  console.log('\n  Top 5 failure reasons:');
  const sortedReasons = Array.from(stats.failureReasons.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (sortedReasons.length === 0) {
    console.log('    (none)');
  } else {
    for (let i = 0; i < sortedReasons.length; i++) {
      const [reason, reasonCount] = sortedReasons[i];
      console.log(`    ${reason}: ${reasonCount}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
}

export async function getAntiqueSeederReport(): Promise<AntiqueSeedReport> {
  const families = await db.select().from(antiqueFamilies);
  
  const imageCounts = await db
    .select({
      familyId: antiqueImages.familyId,
      count: count(),
    })
    .from(antiqueImages)
    .groupBy(antiqueImages.familyId);

  const countMap = new Map(imageCounts.map(ic => [ic.familyId, Number(ic.count)]));
  
  const totalImages = imageCounts.reduce((sum, ic) => sum + Number(ic.count), 0);
  
  const familyImageCounts = families.map(f => countMap.get(f.id) || 0);
  const minImagesPerFamily = familyImageCounts.length ? Math.min(...familyImageCounts) : 0;
  const maxImagesPerFamily = familyImageCounts.length ? Math.max(...familyImageCounts) : 0;
  const avgImagesPerFamily = familyImageCounts.length 
    ? familyImageCounts.reduce((a, b) => a + b, 0) / familyImageCounts.length 
    : 0;

  const lockedFamilies = families
    .filter(f => f.status === 'locked')
    .map(f => ({ brand: f.brand, family: f.family, imageCount: countMap.get(f.id) || 0, subcategory: f.subcategory }));

  const activeFamilies = families
    .filter(f => f.status === 'active')
    .map(f => ({ brand: f.brand, family: f.family, imageCount: countMap.get(f.id) || 0, subcategory: f.subcategory }));

  const queuedFamilies = families
    .filter(f => f.status === 'queued')
    .map(f => ({ brand: f.brand, family: f.family, imageCount: countMap.get(f.id) || 0, subcategory: f.subcategory }));

  const hardFamilies = families
    .filter(f => f.status === 'hard')
    .map(f => ({ brand: f.brand, family: f.family, imageCount: countMap.get(f.id) || 0, listingsScanned: f.listingsScanned, subcategory: f.subcategory }));

  const processedItemsResult = await db.execute(sql`SELECT COUNT(*) as count FROM processed_antique_items`);
  const processedItems = Number(processedItemsResult.rows[0]?.count || 0);

  return {
    totalFamilies: families.length,
    totalImages,
    minImagesPerFamily,
    maxImagesPerFamily,
    avgImagesPerFamily: Math.round(avgImagesPerFamily * 10) / 10,
    lockedFamilies,
    activeFamilies,
    queuedFamilies,
    hardFamilies,
    apiStats: {
      totalApiCalls: 0,
      downloadSuccess: processedItems,
      downloadFailed: 0,
      topFailureReasons: [],
    },
  };
}
