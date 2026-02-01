import { db } from './db';
import { libraryItems, libraryImages } from '@shared/schema';
import { generateImageEmbedding } from './embedding-service';
import { sql } from 'drizzle-orm';

interface SeedItem {
  category: 'watch' | 'shoe' | 'card' | 'collectible' | 'electronics';
  brand: string;
  modelFamily: string;
  title: string;
  variant?: string;
  images: string[];
}

const SEED_DATA: SeedItem[] = [
  // WATCHES - Popular resale brands with Wikipedia images
  {
    category: 'watch',
    brand: 'Rolex',
    modelFamily: 'Submariner',
    title: 'Rolex Submariner Date 116610LN',
    variant: 'Black Dial',
    images: [
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Rolex_Submariner.jpg/440px-Rolex_Submariner.jpg',
    ],
  },
  {
    category: 'watch',
    brand: 'Omega',
    modelFamily: 'Speedmaster',
    title: 'Omega Speedmaster Professional Moonwatch',
    variant: 'Hesalite',
    images: [
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Omega_Speedmaster_Professional_-_2022.jpg/440px-Omega_Speedmaster_Professional_-_2022.jpg',
    ],
  },
  {
    category: 'watch',
    brand: 'Seiko',
    modelFamily: 'SKX',
    title: 'Seiko SKX007',
    variant: 'Pepsi Bezel',
    images: [
      'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Seiko_Diver%27s_200m.jpg/440px-Seiko_Diver%27s_200m.jpg',
    ],
  },
  {
    category: 'watch',
    brand: 'Casio',
    modelFamily: 'G-Shock',
    title: 'Casio G-Shock DW5600E',
    variant: 'Classic Black',
    images: [
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Casio_G-Shock_DW-5600E-1VER.jpg/440px-Casio_G-Shock_DW-5600E-1VER.jpg',
    ],
  },
  {
    category: 'watch',
    brand: 'Invicta',
    modelFamily: 'Pro Diver',
    title: 'Invicta Pro Diver 8926OB',
    variant: 'Automatic Black',
    images: [],
  },
  {
    category: 'watch',
    brand: 'Tissot',
    modelFamily: 'PRX',
    title: 'Tissot PRX Powermatic 80',
    variant: 'Blue Dial',
    images: [],
  },
  {
    category: 'watch',
    brand: 'Hamilton',
    modelFamily: 'Khaki Field',
    title: 'Hamilton Khaki Field Mechanical',
    variant: '38mm',
    images: [],
  },
  {
    category: 'watch',
    brand: 'Orient',
    modelFamily: 'Bambino',
    title: 'Orient Bambino V2',
    variant: 'Cream Dial',
    images: [],
  },
  
  // SHOES - Popular resale sneakers
  {
    category: 'shoe',
    brand: 'Nike',
    modelFamily: 'Air Jordan 1',
    title: 'Air Jordan 1 Retro High OG',
    variant: 'Chicago',
    images: [],
  },
  {
    category: 'shoe',
    brand: 'Nike',
    modelFamily: 'Dunk',
    title: 'Nike Dunk Low',
    variant: 'Panda',
    images: [],
  },
  {
    category: 'shoe',
    brand: 'Adidas',
    modelFamily: 'Yeezy',
    title: 'Yeezy Boost 350 V2',
    variant: 'Zebra',
    images: [],
  },
  {
    category: 'shoe',
    brand: 'New Balance',
    modelFamily: '550',
    title: 'New Balance 550',
    variant: 'White Green',
    images: [],
  },
  {
    category: 'shoe',
    brand: 'Nike',
    modelFamily: 'Air Force 1',
    title: 'Nike Air Force 1 Low',
    variant: 'Triple White',
    images: [],
  },
  {
    category: 'shoe',
    brand: 'Nike',
    modelFamily: 'Air Jordan 4',
    title: 'Air Jordan 4 Retro',
    variant: 'Bred',
    images: [],
  },
  {
    category: 'shoe',
    brand: 'Nike',
    modelFamily: 'Air Max',
    title: 'Nike Air Max 1',
    variant: 'Anniversary Red',
    images: [],
  },
  {
    category: 'shoe',
    brand: 'Adidas',
    modelFamily: 'Stan Smith',
    title: 'Adidas Stan Smith',
    variant: 'White Green',
    images: [],
  },
  
  // TRADING CARDS - Popular cards
  {
    category: 'card',
    brand: 'Pokemon',
    modelFamily: 'Base Set',
    title: 'Charizard Base Set Holo',
    variant: '1st Edition',
    images: [],
  },
  {
    category: 'card',
    brand: 'Pokemon',
    modelFamily: 'Base Set',
    title: 'Pikachu Base Set',
    variant: 'Yellow Cheeks',
    images: [],
  },
  {
    category: 'card',
    brand: 'Pokemon',
    modelFamily: 'Scarlet Violet',
    title: 'Pokemon Scarlet Violet Booster Box',
    variant: 'Sealed',
    images: [],
  },
  {
    category: 'card',
    brand: 'Panini',
    modelFamily: 'Prizm',
    title: 'Panini Prizm Football',
    variant: 'Hobby Box',
    images: [],
  },
  {
    category: 'card',
    brand: 'Topps',
    modelFamily: 'Chrome',
    title: 'Topps Chrome Baseball',
    variant: 'Hobby Box',
    images: [],
  },
  {
    category: 'card',
    brand: 'Upper Deck',
    modelFamily: 'SP Authentic',
    title: 'Upper Deck SP Authentic',
    variant: 'Hockey',
    images: [],
  },
  
  // COLLECTIBLES - Funko, LEGO, Hot Wheels
  {
    category: 'collectible',
    brand: 'Funko',
    modelFamily: 'Pop Marvel',
    title: 'Funko Pop Marvel Spider-Man',
    variant: 'No Way Home',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Funko',
    modelFamily: 'Pop Star Wars',
    title: 'Funko Pop Star Wars Darth Vader',
    variant: 'Chrome',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Funko',
    modelFamily: 'Pop Disney',
    title: 'Funko Pop Disney Mickey Mouse',
    variant: 'Diamond Collection',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'LEGO',
    modelFamily: 'Star Wars',
    title: 'LEGO Star Wars Millennium Falcon',
    variant: '75192',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'LEGO',
    modelFamily: 'Technic',
    title: 'LEGO Technic Porsche 911',
    variant: '42056',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'LEGO',
    modelFamily: 'Architecture',
    title: 'LEGO Architecture Eiffel Tower',
    variant: '10307',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Hot Wheels',
    modelFamily: 'Treasure Hunt',
    title: 'Hot Wheels Super Treasure Hunt',
    variant: '2024',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Hot Wheels',
    modelFamily: 'RLC',
    title: 'Hot Wheels Red Line Club',
    variant: 'Exclusive',
    images: [],
  },
  
  // COMICS - CGC Graded, Key Issues, Popular Series
  {
    category: 'collectible',
    brand: 'Marvel',
    modelFamily: 'Amazing Spider-Man',
    title: 'Amazing Spider-Man #300 CGC',
    variant: 'First Venom',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Marvel',
    modelFamily: 'X-Men',
    title: 'Giant-Size X-Men #1 CGC',
    variant: 'First New X-Men',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Marvel',
    modelFamily: 'Incredible Hulk',
    title: 'Incredible Hulk #181 CGC',
    variant: 'First Wolverine',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'DC',
    modelFamily: 'Batman',
    title: 'Batman #1 CGC',
    variant: 'Golden Age',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'DC',
    modelFamily: 'Action Comics',
    title: 'Action Comics #1 CGC',
    variant: 'First Superman',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'DC',
    modelFamily: 'Detective Comics',
    title: 'Detective Comics #27 CGC',
    variant: 'First Batman',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Image',
    modelFamily: 'Spawn',
    title: 'Spawn #1 CGC',
    variant: 'First Print',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Marvel',
    modelFamily: 'New Mutants',
    title: 'New Mutants #98 CGC',
    variant: 'First Deadpool',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Marvel',
    modelFamily: 'Avengers',
    title: 'Avengers #4 CGC',
    variant: 'Captain America Returns',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'DC',
    modelFamily: 'Watchmen',
    title: 'Watchmen #1 CGC',
    variant: 'First Print',
    images: [],
  },
  
  // VINYL RECORDS - Popular Resale Albums
  {
    category: 'collectible',
    brand: 'Vinyl',
    modelFamily: 'Classic Rock',
    title: 'Pink Floyd The Dark Side of the Moon',
    variant: 'First Press',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Vinyl',
    modelFamily: 'Classic Rock',
    title: 'Led Zeppelin IV',
    variant: 'Original Press',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Vinyl',
    modelFamily: 'Hip Hop',
    title: 'Kendrick Lamar To Pimp A Butterfly',
    variant: 'Sealed',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Vinyl',
    modelFamily: 'Pop',
    title: 'Taylor Swift Midnights',
    variant: 'Lavender Edition',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Vinyl',
    modelFamily: 'Soundtrack',
    title: 'Guardians of the Galaxy Awesome Mix',
    variant: 'Picture Disc',
    images: [],
  },
  
  // VINTAGE VIDEO GAMES - CIB and Sealed
  {
    category: 'collectible',
    brand: 'Nintendo',
    modelFamily: 'NES',
    title: 'Super Mario Bros NES CIB',
    variant: 'Complete In Box',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Nintendo',
    modelFamily: 'SNES',
    title: 'Chrono Trigger SNES CIB',
    variant: 'Complete',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Nintendo',
    modelFamily: 'N64',
    title: 'Legend of Zelda Ocarina of Time N64',
    variant: 'Gold Cart',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Sega',
    modelFamily: 'Genesis',
    title: 'Sonic the Hedgehog Genesis CIB',
    variant: 'Complete',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Nintendo',
    modelFamily: 'GameBoy',
    title: 'Pokemon Red GameBoy CIB',
    variant: 'Complete',
    images: [],
  },
  
  // BOARD GAMES - Sealed Collectible
  {
    category: 'collectible',
    brand: 'Hasbro',
    modelFamily: 'Monopoly',
    title: 'Monopoly Vintage 1935',
    variant: 'First Edition',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Fantasy Flight',
    modelFamily: 'Arkham Horror',
    title: 'Arkham Horror LCG Core',
    variant: 'First Print',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Days of Wonder',
    modelFamily: 'Ticket to Ride',
    title: 'Ticket to Ride 10th Anniversary',
    variant: 'Limited',
    images: [],
  },
  
  // ACTION FIGURES - McFarlane, NECA, Mezco
  {
    category: 'collectible',
    brand: 'McFarlane',
    modelFamily: 'DC Multiverse',
    title: 'McFarlane DC Multiverse Batman',
    variant: 'Gold Label',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'NECA',
    modelFamily: 'TMNT',
    title: 'NECA TMNT Leonardo',
    variant: '1990 Movie',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Mezco',
    modelFamily: 'One:12',
    title: 'Mezco One:12 Punisher',
    variant: 'Exclusive',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Hasbro',
    modelFamily: 'Marvel Legends',
    title: 'Marvel Legends Spider-Man',
    variant: 'Retro Card',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Super7',
    modelFamily: 'Ultimates',
    title: 'Super7 Ultimates Thundercats Lion-O',
    variant: 'Wave 1',
    images: [],
  },
  
  // ANIME COLLECTIBLES - Figures and Statues
  {
    category: 'collectible',
    brand: 'Bandai',
    modelFamily: 'S.H. Figuarts',
    title: 'S.H. Figuarts Dragon Ball Goku',
    variant: 'Ultra Instinct',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Good Smile',
    modelFamily: 'Nendoroid',
    title: 'Nendoroid Demon Slayer Tanjiro',
    variant: 'Standard',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Banpresto',
    modelFamily: 'Grandista',
    title: 'Banpresto Grandista Naruto',
    variant: 'Sage Mode',
    images: [],
  },
  {
    category: 'collectible',
    brand: 'Kotobukiya',
    modelFamily: 'ARTFX+',
    title: 'Kotobukiya ARTFX My Hero Academia',
    variant: 'All Might',
    images: [],
  },
  
  // ELECTRONICS - Gaming, Phones, Audio
  {
    category: 'electronics',
    brand: 'Sony',
    modelFamily: 'PlayStation',
    title: 'PlayStation 5 Console',
    variant: 'Disc Edition',
    images: [],
  },
  {
    category: 'electronics',
    brand: 'Microsoft',
    modelFamily: 'Xbox',
    title: 'Xbox Series X',
    variant: '1TB',
    images: [],
  },
  {
    category: 'electronics',
    brand: 'Nintendo',
    modelFamily: 'Switch',
    title: 'Nintendo Switch OLED',
    variant: 'White',
    images: [],
  },
  {
    category: 'electronics',
    brand: 'Apple',
    modelFamily: 'iPhone',
    title: 'iPhone 15 Pro Max',
    variant: 'Natural Titanium',
    images: [],
  },
  {
    category: 'electronics',
    brand: 'Apple',
    modelFamily: 'iPad',
    title: 'iPad Pro 12.9',
    variant: 'M2 Chip',
    images: [],
  },
  {
    category: 'electronics',
    brand: 'Apple',
    modelFamily: 'MacBook',
    title: 'MacBook Pro 14',
    variant: 'M3 Pro',
    images: [],
  },
  {
    category: 'electronics',
    brand: 'Apple',
    modelFamily: 'AirPods',
    title: 'AirPods Pro 2nd Gen',
    variant: 'USB-C',
    images: [],
  },
  {
    category: 'electronics',
    brand: 'Sony',
    modelFamily: 'WH-1000XM',
    title: 'Sony WH-1000XM5',
    variant: 'Black',
    images: [],
  },
  {
    category: 'electronics',
    brand: 'Bose',
    modelFamily: 'QuietComfort',
    title: 'Bose QuietComfort Ultra',
    variant: 'Headphones',
    images: [],
  },
  {
    category: 'electronics',
    brand: 'Dyson',
    modelFamily: 'V15',
    title: 'Dyson V15 Detect',
    variant: 'Absolute',
    images: [],
  },
  {
    category: 'electronics',
    brand: 'Meta',
    modelFamily: 'Quest',
    title: 'Meta Quest 3',
    variant: '128GB',
    images: [],
  },
];

export async function seedLibrary(): Promise<{ itemsCreated: number; imagesCreated: number }> {
  let itemsCreated = 0;
  let imagesCreated = 0;

  for (const item of SEED_DATA) {
    try {
      const existing = await db
        .select()
        .from(libraryItems)
        .where(sql`lower(${libraryItems.title}) = lower(${item.title})`)
        .limit(1);
      
      if (existing.length > 0) {
        console.log(`Skipping existing item: ${item.title}`);
        continue;
      }
      
      const [newItem] = await db
        .insert(libraryItems)
        .values({
          category: item.category,
          brand: item.brand,
          modelFamily: item.modelFamily,
          title: item.title,
          variant: item.variant || null,
          attributes: {},
          status: 'active',
        })
        .returning();

      itemsCreated++;
      console.log(`Created item: ${item.title}`);

      for (const imageUrl of item.images) {
        try {
          const { embedding, hash } = await generateImageEmbedding(imageUrl);

          const [newImage] = await db
            .insert(libraryImages)
            .values({
              itemId: newItem.id,
              category: item.category,
              imageUrl,
              imageHash: hash,
              imageType: item.category === 'watch' ? 'dial' : item.category === 'shoe' ? 'side' : 'front',
              source: 'seed',
              qualityScore: '1.0',
            })
            .returning();

          await db.execute(sql`
            UPDATE library_images 
            SET embedding = ${`[${embedding.join(',')}]`}::vector
            WHERE id = ${newImage.id}
          `);

          imagesCreated++;
          console.log(`  Added image: ${imageUrl.substring(0, 50)}...`);
        } catch (imgError) {
          console.error(`  Failed to add image: ${imageUrl}`, imgError);
        }
      }
    } catch (error) {
      console.error(`Failed to create item: ${item.title}`, error);
    }
  }

  return { itemsCreated, imagesCreated };
}

export function getSeedCount(): { total: number; byCategory: Record<string, number> } {
  const byCategory: Record<string, number> = {};
  for (const item of SEED_DATA) {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
  }
  return { total: SEED_DATA.length, byCategory };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedLibrary()
    .then(result => {
      console.log(`\nSeeding complete: ${result.itemsCreated} items, ${result.imagesCreated} images`);
      process.exit(0);
    })
    .catch(err => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}
