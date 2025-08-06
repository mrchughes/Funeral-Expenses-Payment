// Form structure that matches the actual form implementation
export const formSections = [
  {
    id: 'evidence-documentation',
    title: 'Evidence and documentation',
    fields: [
      {
        name: 'evidence',
        label: 'Documents you can provide',
        type: 'checkbox',
        options: [
          'Death certificate',
          'Funeral bill or estimate',
          'Proof of benefits',
          'Proof of relationship to deceased',
          'Proof of responsibility for funeral'
        ],
        required: true
      },
      {
        name: 'relationshipToDeceased',
        label: 'What is your relationship to the deceased?',
        type: 'radio',
        options: [
          'Spouse or civil partner',
          'Child',
          'Parent',
          'Sibling',
          'Other family member',
          'Friend'
        ],
        required: true
      }
    ]
  },
  {
    id: 'personal-details',
    title: 'Your personal details',
    fields: [
      // Name fields removed as they are populated from user registration
      { name: 'dateOfBirth', label: 'Date of birth', type: 'date', required: true },
      { name: 'nationalInsuranceNumber', label: 'National Insurance number', type: 'text', required: true }
    ]
  },
  {
    id: 'contact-details',
    title: 'Your contact details',
    fields: [
      { name: 'addressLine1', label: 'Address line 1', type: 'text', required: true },
      { name: 'addressLine2', label: 'Address line 2', type: 'text', required: false },
      { name: 'town', label: 'Town or city', type: 'text', required: true },
      { name: 'county', label: 'County', type: 'text', required: false },
      { name: 'postcode', label: 'Postcode', type: 'text', required: true },
      { name: 'phoneNumber', label: 'Phone number', type: 'tel', required: true },
      { name: 'email', label: 'Email address', type: 'email', required: true }
    ]
  },
  {
    id: 'partner-details',
    title: 'Partner details',
    fields: [
      {
        name: 'hasPartner',
        label: 'Did the person who died have a partner?',
        type: 'radio',
        options: ['Yes', 'No'],
        required: true
      },
      { name: 'partnerFirstName', label: 'Partner\'s first name', type: 'text', required: false, conditional: { field: 'hasPartner', value: 'yes' } },
      { name: 'partnerLastName', label: 'Partner\'s last name', type: 'text', required: false, conditional: { field: 'hasPartner', value: 'yes' } },
      { name: 'partnerDateOfBirth', label: 'Partner\'s date of birth', type: 'date', required: false, conditional: { field: 'hasPartner', value: 'yes' } },
      { name: 'partnerNationalInsuranceNumber', label: 'Partner\'s National Insurance number', type: 'text', required: false, conditional: { field: 'hasPartner', value: 'yes' } },
      {
        name: 'partnerBenefitsReceived',
        label: 'Benefits the partner receives',
        type: 'checkbox',
        options: [
          'Income Support',
          'Jobseeker\'s Allowance (income-based)',
          'Employment and Support Allowance (income-related)',
          'Pension Credit',
          'Universal Credit',
          'Housing Benefit',
          'Working Tax Credit',
          'Child Tax Credit',
          'None of these'
        ],
        required: false,
        conditional: { field: 'hasPartner', value: 'yes' }
      },
      {
        name: 'partnerSavings',
        label: 'Does the partner have more than £16,000 in savings?',
        type: 'radio',
        options: ['Yes', 'No'],
        required: false,
        conditional: { field: 'hasPartner', value: 'yes' }
      }
    ]
  },
  {
    id: 'family-composition',
    title: 'Family composition and dependents',
    fields: [
      {
        name: 'hasChildren',
        label: 'Do you have any children?',
        type: 'radio',
        options: ['Yes', 'No'],
        required: true
      },
      { name: 'numberOfChildren', label: 'Number of children', type: 'number', required: false, conditional: { field: 'hasChildren', value: 'yes' } },
      { name: 'childrenDetails', label: 'Children\'s details', type: 'textarea', required: false, conditional: { field: 'hasChildren', value: 'yes' } },
      {
        name: 'hasDependents',
        label: 'Do you have any other people who depend on you financially?',
        type: 'radio',
        options: ['Yes', 'No'],
        required: false
      },
      { name: 'dependentsDetails', label: 'Details about your dependents', type: 'textarea', required: false, conditional: { field: 'hasDependents', value: 'yes' } },
      { name: 'householdSize', label: 'How many people live in your household?', type: 'number', required: true },
      { name: 'householdMembers', label: 'Household members (optional)', type: 'textarea', required: false }
    ]
  },
  {
    id: 'enhanced-benefits',
    title: 'Enhanced benefits information',
    fields: [
      {
        name: 'householdBenefits',
        label: 'Household benefits',
        type: 'checkbox',
        options: [
          'Income Support',
          'Jobseeker\'s Allowance (income-based)',
          'Employment and Support Allowance (income-related)',
          'Pension Credit',
          'Universal Credit',
          'Housing Benefit',
          'Council Tax Support',
          'Working Tax Credit',
          'Child Tax Credit',
          'None of these'
        ],
        required: false
      },
      { name: 'incomeSupportDetails', label: 'Income Support details', type: 'textarea', required: false, conditional: { field: 'householdBenefits', value: 'Income Support' } },
      {
        name: 'disabilityBenefits',
        label: 'Disability benefits',
        type: 'checkbox',
        options: [
          'Disability Living Allowance (DLA)',
          'Personal Independence Payment (PIP)',
          'Attendance Allowance',
          'Carer\'s Allowance',
          'Industrial Injuries Disablement Benefit',
          'War Disablement Pension',
          'None of these'
        ],
        required: false
      },
      {
        name: 'carersAllowance',
        label: 'Do you receive Carer\'s Allowance?',
        type: 'radio',
        options: ['Yes', 'No'],
        required: false
      },
      { name: 'carersAllowanceDetails', label: 'Carer\'s Allowance details', type: 'textarea', required: false, conditional: { field: 'carersAllowance', value: 'yes' } }
    ]
  },
  {
    id: 'about-deceased',
    title: 'About the person who died',
    fields: [
      { name: 'deceasedFirstName', label: 'First name', type: 'text', required: true },
      { name: 'deceasedLastName', label: 'Last name', type: 'text', required: true },
      { name: 'deceasedDateOfBirth', label: 'Date of birth', type: 'date', required: true },
      { name: 'deceasedDateOfDeath', label: 'Date of death', type: 'date', required: true },
      {
        name: 'relationshipToDeceased',
        label: 'Relationship to deceased',
        type: 'radio',
        options: [
          'Spouse or civil partner',
          'Child',
          'Parent',
          'Sibling',
          'Other family member',
          'Friend'
        ],
        required: true
      }
    ]
  },
  {
    id: 'deceased-address',
    title: 'Address of the person who died',
    fields: [
      { name: 'deceasedAddressLine1', label: 'Address line 1', type: 'text', required: true },
      { name: 'deceasedAddressLine2', label: 'Address line 2', type: 'text', required: false },
      { name: 'deceasedTown', label: 'Town or city', type: 'text', required: true },
      { name: 'deceasedCounty', label: 'County', type: 'text', required: false },
      { name: 'deceasedPostcode', label: 'Postcode', type: 'text', required: true },
      { name: 'deceasedUsualAddress', label: 'Was this their usual address?', type: 'radio', options: ['Yes', 'No'], required: false }
    ]
  },
  {
    id: 'responsibility',
    title: 'Responsibility for funeral arrangements',
    fields: [
      {
        name: 'responsibilityReason',
        label: 'Why are you responsible for the funeral arrangements?',
        type: 'radio',
        options: [
          'I am the partner of the person who died',
          'I am a close relative and no partner survives',
          'I am a close friend and no partner or close relative can arrange the funeral',
          'I am the parent of a baby who was stillborn or died as a child',
          'Other'
        ],
        required: true
      },
      { name: 'nextOfKin', label: 'Next of kin details', type: 'textarea', required: false },
      { name: 'otherResponsiblePerson', label: 'Other responsible person', type: 'text', required: false }
    ]
  },
  {
    id: 'funeral-details',
    title: 'Funeral details',
    fields: [
      { name: 'funeralDirector', label: 'Funeral director name', type: 'text', required: true },
      { name: 'funeralCost', label: 'Total cost of funeral (£)', type: 'number', required: true },
      { name: 'funeralDate', label: 'Date of funeral', type: 'date', required: false },
      { name: 'funeralLocation', label: 'Location of funeral', type: 'text', required: false },
      {
        name: 'burialOrCremation',
        label: 'Burial or cremation?',
        type: 'radio',
        options: ['Burial', 'Cremation'],
        required: true
      }
    ]
  },
  {
    id: 'estate-assets',
    title: 'Estate and assets',
    fields: [
      {
        name: 'estateValue',
        label: 'Estimated estate value',
        type: 'radio',
        options: ['Under £5,000', '£5,000 or more', 'Don\'t know'],
        required: false
      },
      {
        name: 'propertyOwned',
        label: 'Did the deceased person own any property?',
        type: 'radio',
        options: ['Yes', 'No'],
        required: false
      },
      { name: 'propertyDetails', label: 'Property details', type: 'textarea', required: false, conditional: { field: 'propertyOwned', value: 'yes' } },
      { name: 'bankAccounts', label: 'Bank accounts and building society accounts', type: 'textarea', required: false },
      { name: 'investments', label: 'Investments', type: 'textarea', required: false },
      { name: 'lifeInsurance', label: 'Life insurance', type: 'textarea', required: false },
      { name: 'debtsOwed', label: 'Debts owed', type: 'textarea', required: false },
      {
        name: 'willExists',
        label: 'Did the deceased person leave a will?',
        type: 'radio',
        options: ['Yes', 'No', 'Don\'t know'],
        required: false
      },
      { name: 'willDetails', label: 'Will details', type: 'textarea', required: false, conditional: { field: 'willExists', value: 'yes' } }
    ]
  },
  {
    id: 'financial-circumstances',
    title: 'Your financial circumstances',
    fields: [
      {
        name: 'benefitsReceived',
        label: 'Benefits you receive',
        type: 'checkbox',
        options: [
          'Income Support',
          'Income-based Jobseeker\'s Allowance',
          'Income-related Employment and Support Allowance',
          'Pension Credit',
          'Universal Credit',
          'Child Tax Credit',
          'Working Tax Credit',
          'None of these'
        ],
        required: true
      },
      { name: 'employmentStatus', label: 'Employment status', type: 'text', required: false },
      {
        name: 'savings',
        label: 'Do you have more than £16,000 in savings?',
        type: 'radio',
        options: ['Yes', 'No'],
        required: true
      },
      { name: 'savingsAmount', label: 'Approximate amount of savings', type: 'text', required: false, conditional: { field: 'savings', value: 'yes' } },
      { name: 'otherIncome', label: 'Other income', type: 'textarea', required: false }
    ]
  },
  {
    id: 'declaration',
    title: 'Declaration',
    fields: [
      {
        name: 'informationCorrect',
        label: 'I declare that the information I have given is true and complete',
        type: 'checkbox',
        required: true
      },
      {
        name: 'notifyChanges',
        label: 'I understand that I must notify DWP if my circumstances change',
        type: 'checkbox',
        required: true
      },
      {
        name: 'declarationAgreed',
        label: 'I agree to the terms and conditions',
        type: 'checkbox',
        required: true
      }
    ]
  }
];

export const getConditionalFields = (formData) => {
  const conditionalFields = {};

  formSections.forEach(section => {
    section.fields.forEach(field => {
      if (field.conditional) {
        const { field: condField, value: condValue } = field.conditional;

        // Special handling for array-based conditions (like householdBenefits)
        if (Array.isArray(formData[condField])) {
          conditionalFields[field.name] = formData[condField]?.includes(condValue) || false;
        } else {
          // Case-insensitive comparison for string values
          conditionalFields[field.name] =
            typeof formData[condField] === 'string' &&
            typeof condValue === 'string' &&
            formData[condField]?.toLowerCase() === condValue.toLowerCase();
        }
      } else {
        // Show all non-conditional fields by default
        conditionalFields[field.name] = true;
      }
    });
  });

  console.log('🔍 getConditionalFields: formData keys:', Object.keys(formData || {}));
  console.log('🔍 getConditionalFields: conditionalFields:', conditionalFields);

  return conditionalFields;
};
