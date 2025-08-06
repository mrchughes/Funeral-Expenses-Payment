const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Connection URL
const url = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const client = new MongoClient(url);

// Database Name
const dbName = 'forms';

// Sample form data with semantic information
const funeralExpensesForm = {
    id: 'funeral-expenses-payment',
    name: 'Funeral Expenses Payment',
    description: 'Application for help with funeral costs from the Social Fund',
    semantics: {
        domain: 'bereavement',
        relatedDocumentTypes: ['death_certificate', 'funeral_invoice', 'benefit_award_letter']
    },
    fields: [
        {
            id: 'applicant_full_name',
            name: 'Full name',
            description: 'Your full name, including first name and surname',
            type: 'text',
            required: true,
            semantics: {
                synonyms: ['name', 'given name', 'forename', 'surname', 'family name'],
                category: 'personal',
                relations: []
            },
            examples: ['John Smith', 'Jane Doe'],
            documentSections: ['personal details', 'applicant details'],
            extractionPatterns: {
                regexPatterns: ['[A-Z][a-z]+ [A-Z][a-z]+'],
                formatHints: ['First Last', 'Title First Last'],
                contextualKeywords: ['name', 'your name', 'claimant']
            }
        },
        {
            id: 'applicant_dob',
            name: 'Date of birth',
            description: 'Your date of birth',
            type: 'date',
            required: true,
            semantics: {
                synonyms: ['birth date', 'born on', 'DOB', 'birthday'],
                category: 'personal',
                relations: []
            },
            examples: ['01/01/1980', '15 January 1980'],
            documentSections: ['personal details', 'applicant details'],
            extractionPatterns: {
                regexPatterns: ['\\d{1,2}/\\d{1,2}/\\d{4}', '\\d{1,2}-\\d{1,2}-\\d{4}'],
                formatHints: ['DD/MM/YYYY', 'D Month YYYY'],
                contextualKeywords: ['date of birth', 'dob', 'born']
            }
        },
        {
            id: 'applicant_nino',
            name: 'National Insurance Number',
            description: 'Your National Insurance number',
            type: 'text',
            required: true,
            semantics: {
                synonyms: ['NI number', 'NINO', 'insurance number', 'NI'],
                category: 'personal',
                relations: []
            },
            examples: ['AB123456C', 'XY 12 34 56 Z'],
            documentSections: ['personal details', 'applicant details'],
            extractionPatterns: {
                regexPatterns: ['[A-Z]{2}\\s?\\d{2}\\s?\\d{2}\\s?\\d{2}\\s?[A-Z]', '[A-Z]{2}\\d{6}[A-Z]'],
                formatHints: ['2 letters, 6 numbers, 1 letter'],
                contextualKeywords: ['national insurance', 'NI number', 'NINO']
            }
        },
        {
            id: 'deceased_full_name',
            name: 'Deceased name',
            description: 'Full name of the person who has died',
            type: 'text',
            required: true,
            semantics: {
                synonyms: ['name of deceased', 'dead person name', 'name of person who died'],
                category: 'deceased',
                relations: []
            },
            examples: ['John Smith', 'Jane Doe'],
            documentSections: ['deceased details', 'death certificate'],
            extractionPatterns: {
                regexPatterns: ['[A-Z][a-z]+ [A-Z][a-z]+'],
                formatHints: ['First Last', 'Title First Last'],
                contextualKeywords: ['deceased', 'death', 'died', 'passed away']
            }
        },
        {
            id: 'deceased_dod',
            name: 'Date of death',
            description: 'Date when the person died',
            type: 'date',
            required: true,
            semantics: {
                synonyms: ['death date', 'died on', 'DOD', 'date died', 'passed away on'],
                category: 'deceased',
                relations: []
            },
            examples: ['01/01/2023', '15 January 2023'],
            documentSections: ['deceased details', 'death certificate'],
            extractionPatterns: {
                regexPatterns: ['\\d{1,2}/\\d{1,2}/\\d{4}', '\\d{1,2}-\\d{1,2}-\\d{4}'],
                formatHints: ['DD/MM/YYYY', 'D Month YYYY'],
                contextualKeywords: ['date of death', 'died on', 'death']
            }
        },
        {
            id: 'funeral_director_name',
            name: 'Funeral director name',
            description: 'Name of the funeral director or company',
            type: 'text',
            required: true,
            semantics: {
                synonyms: ['funeral home', 'undertaker', 'mortician', 'funeral provider'],
                category: 'funeral',
                relations: []
            },
            examples: ['Smith & Sons Funeral Services', 'City Funeral Home'],
            documentSections: ['funeral details', 'invoice'],
            extractionPatterns: {
                regexPatterns: ['[A-Z][a-z]+(?: & | and )(?:Sons|Co|Ltd)', '[A-Z][a-z]+ Funeral (?:Home|Services|Directors)'],
                formatHints: ['Company Name', 'Name & Sons'],
                contextualKeywords: ['funeral director', 'funeral home', 'services provided by']
            }
        },
        {
            id: 'funeral_cost',
            name: 'Total funeral cost',
            description: 'The total cost of the funeral',
            type: 'number',
            required: true,
            semantics: {
                synonyms: ['funeral price', 'cost', 'total amount', 'invoice total'],
                category: 'financial',
                relations: []
            },
            examples: ['£3,500', '4250.00'],
            documentSections: ['invoice', 'funeral details'],
            extractionPatterns: {
                regexPatterns: ['£[\\d,]+\\.?\\d{0,2}', 'Total:?\\s*£?[\\d,]+\\.?\\d{0,2}'],
                formatHints: ['£XXXX.XX', 'XXXX.XX'],
                contextualKeywords: ['total', 'amount due', 'to pay', 'balance', 'cost']
            }
        },
        {
            id: 'funeral_date',
            name: 'Funeral date',
            description: 'The date when the funeral took place or will take place',
            type: 'date',
            required: true,
            semantics: {
                synonyms: ['service date', 'ceremony date', 'cremation date', 'burial date'],
                category: 'funeral',
                relations: []
            },
            examples: ['01/01/2023', '15 January 2023'],
            documentSections: ['funeral details', 'invoice'],
            extractionPatterns: {
                regexPatterns: ['\\d{1,2}/\\d{1,2}/\\d{4}', '\\d{1,2}-\\d{1,2}-\\d{4}'],
                formatHints: ['DD/MM/YYYY', 'D Month YYYY'],
                contextualKeywords: ['funeral date', 'service date', 'date of funeral', 'cremation date']
            }
        },
        {
            id: 'relationship_to_deceased',
            name: 'Relationship to deceased',
            description: 'Your relationship to the person who died',
            type: 'text',
            required: true,
            semantics: {
                synonyms: ['relation', 'how related', 'kinship', 'family connection'],
                category: 'relationship',
                relations: []
            },
            examples: ['Spouse', 'Son', 'Daughter', 'Partner'],
            documentSections: ['personal details', 'relationship details'],
            extractionPatterns: {
                regexPatterns: ['(?:husband|wife|spouse|partner|son|daughter|brother|sister|mother|father|parent|child)'],
                formatHints: ['Single word', 'Family relationship term'],
                contextualKeywords: ['relation', 'related', 'relationship']
            }
        },
        {
            id: 'benefit_confirmation',
            name: 'Qualifying benefit',
            description: 'Confirmation of qualifying benefit received',
            type: 'text',
            required: true,
            semantics: {
                synonyms: ['welfare', 'support', 'entitlement', 'social security'],
                category: 'eligibility',
                relations: []
            },
            examples: ['Universal Credit', 'Income Support', 'Pension Credit'],
            documentSections: ['benefit details', 'award letter'],
            extractionPatterns: {
                regexPatterns: ['(?:Universal Credit|Income Support|Pension Credit|Jobseeker\'s Allowance)'],
                formatHints: ['Benefit name'],
                contextualKeywords: ['benefit', 'entitled to', 'receiving', 'awarded', 'payment']
            }
        }
    ]
};

// Sample user context data
const userContext = {
    userId: 'user123',
    personalContext: {
        userName: 'Sarah Johnson',
        deceasedName: 'Brian Hughes',
        relationship: 'Daughter',
        addresses: [
            {
                type: 'home',
                line1: '42 Maple Street',
                line2: 'Apartment 3B',
                city: 'Manchester',
                county: 'Greater Manchester',
                postcode: 'M1 2AB'
            },
            {
                type: 'deceased',
                line1: '15 Oak Road',
                city: 'Manchester',
                county: 'Greater Manchester',
                postcode: 'M4 5CD'
            }
        ],
        contactDetails: {
            phone: '07700 900123',
            email: 'sarah.johnson@example.com'
        },
        identifiers: [
            {
                type: 'national_insurance',
                value: 'AB123456C'
            }
        ]
    },
    applicationContext: {
        applicationId: 'FEP-2023-12345',
        applicationType: 'funeral_expenses_payment',
        applicationStatus: 'in_progress',
        dateOfDeath: new Date('2023-07-15'),
        dateOfFuneral: new Date('2023-07-25'),
        dateOfApplication: new Date('2023-07-18')
    }
};

// Sample document type data
const documentTypes = [
    {
        id: 'death_certificate',
        name: 'Death Certificate',
        description: 'Official document certifying the death of an individual',
        semantics: {
            keywords: ['death', 'certificate', 'died', 'certified copy', 'registration district', 'cause of death'],
            visualFeatures: ['official seal', 'coat of arms', 'certificate border'],
            relatedForms: ['funeral-expenses-payment']
        }
    },
    {
        id: 'funeral_invoice',
        name: 'Funeral Invoice',
        description: 'Invoice from funeral director detailing funeral costs',
        semantics: {
            keywords: ['invoice', 'funeral', 'cost', 'director', 'services', 'payment', 'balance'],
            visualFeatures: ['company logo', 'itemized list', 'total amount'],
            relatedForms: ['funeral-expenses-payment']
        }
    },
    {
        id: 'benefit_award_letter',
        name: 'Benefit Award Letter',
        description: 'Letter confirming entitlement to benefits',
        semantics: {
            keywords: ['benefit', 'award', 'entitled', 'payment', 'department', 'work', 'pensions', 'dwp'],
            visualFeatures: ['government logo', 'personal details section', 'payment details'],
            relatedForms: ['funeral-expenses-payment']
        }
    }
];

// Function to seed the database
async function seedDatabase() {
    try {
        // Connect to the MongoDB server
        await client.connect();
        console.log('Connected to MongoDB server');

        // Get database and collections
        const database = client.db(dbName);
        const formsCollection = database.collection('forms');
        const userContextsCollection = database.collection('usercontexts');
        const documentTypesCollection = database.collection('documenttypes');

        // Drop existing collections
        await formsCollection.drop().catch(() => console.log('No forms collection to drop'));
        await userContextsCollection.drop().catch(() => console.log('No usercontexts collection to drop'));
        await documentTypesCollection.drop().catch(() => console.log('No documenttypes collection to drop'));

        // Insert form data
        const formResult = await formsCollection.insertOne(funeralExpensesForm);
        console.log(`Inserted form with ID: ${formResult.insertedId}`);

        // Insert user context
        const userResult = await userContextsCollection.insertOne(userContext);
        console.log(`Inserted user context with ID: ${userResult.insertedId}`);

        // Insert document types
        const docTypesResult = await documentTypesCollection.insertMany(documentTypes);
        console.log(`Inserted ${docTypesResult.insertedCount} document types`);

        console.log('Database seeding completed successfully');
    } finally {
        // Close the connection
        await client.close();
        console.log('MongoDB connection closed');
    }
}

// Run the seeder
seedDatabase().catch(console.error);
