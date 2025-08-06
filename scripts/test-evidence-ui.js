/**
 * Test script for UI changes to the evidence upload section
 * This script performs basic validation of the DOM structure
 */

const puppeteer = require('puppeteer');

// Configuration
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const TEST_USER = { email: 'test@example.com', password: 'test123' };

async function testEvidenceUploadUI() {
    console.log('=== Testing Evidence Upload UI ===');

    // Launch browser
    const browser = await puppeteer.launch({
        headless: false, // Set to true for headless mode
        defaultViewport: null,
        args: ['--window-size=1200,800']
    });

    try {
        const page = await browser.newPage();

        // Navigate to the application
        console.log(`Navigating to ${APP_URL}`);
        await page.goto(APP_URL, { waitUntil: 'networkidle2' });

        // Login (if needed)
        if (await page.$('input[name="email"]')) {
            console.log('Logging in...');
            await page.type('input[name="email"]', TEST_USER.email);
            await page.type('input[name="password"]', TEST_USER.password);
            await Promise.all([
                page.click('button[type="submit"]'),
                page.waitForNavigation({ waitUntil: 'networkidle2' })
            ]);
        }

        // Navigate to the evidence form section
        console.log('Navigating to evidence section...');
        let foundEvidenceSection = false;

        // Try to find and click on a link to the evidence section
        const links = await page.$$('a');
        for (const link of links) {
            const text = await page.evaluate(el => el.textContent, link);
            if (text.includes('Evidence') || text.includes('Documents')) {
                console.log('Found evidence link, clicking...');
                await Promise.all([
                    link.click(),
                    page.waitForNavigation({ waitUntil: 'networkidle2' })
                ]);
                foundEvidenceSection = true;
                break;
            }
        }

        // If we couldn't find a direct link, try going through form steps
        if (!foundEvidenceSection) {
            console.log('No direct link found, trying to navigate through form steps...');
            // Look for next buttons and try to navigate
            while (!foundEvidenceSection) {
                // Check if we're on the evidence page
                const pageTitle = await page.evaluate(() => {
                    const h2 = document.querySelector('h2.govuk-heading-l');
                    return h2 ? h2.textContent : '';
                });

                if (pageTitle.includes('Evidence') || pageTitle.includes('Documents')) {
                    console.log('Found evidence section!');
                    foundEvidenceSection = true;
                    break;
                }

                // Click next button if available
                const nextButton = await page.$('button:not([disabled]):not([aria-disabled="true"]):not(.disabled)');
                if (!nextButton) {
                    console.log('No more next buttons, aborting navigation');
                    break;
                }

                await Promise.all([
                    nextButton.click(),
                    page.waitForNavigation({ waitUntil: 'networkidle2' })
                ]);
            }
        }

        if (!foundEvidenceSection) {
            console.error('Could not find evidence section in the application');
            return;
        }

        // Now we should be on the evidence page, let's check the UI elements
        console.log('Checking evidence page elements...');

        // Check for deceased name fields
        const hasDeceasedFirstName = await page.evaluate(() =>
            !!document.querySelector('input[name="deceasedFirstName"]'));
        const hasDeceasedLastName = await page.evaluate(() =>
            !!document.querySelector('input[name="deceasedLastName"]'));

        console.log(`Deceased first name field present: ${hasDeceasedFirstName}`);
        console.log(`Deceased last name field present: ${hasDeceasedLastName}`);

        // Check for applicant name fields
        const hasFirstName = await page.evaluate(() =>
            !!document.querySelector('input[name="firstName"]'));
        const hasLastName = await page.evaluate(() =>
            !!document.querySelector('input[name="lastName"]'));

        console.log(`Applicant first name field present: ${hasFirstName}`);
        console.log(`Applicant last name field present: ${hasLastName}`);

        // Check that document type checkboxes are NOT present
        const hasDocTypeCheckboxes = await page.evaluate(() => {
            const legend = Array.from(document.querySelectorAll('legend')).find(
                el => el.textContent.includes('Which documents can you provide?')
            );
            return !!legend;
        });

        console.log(`Document type checkboxes absent: ${!hasDocTypeCheckboxes}`);

        // Check for file upload component
        const hasFileUpload = await page.evaluate(() =>
            !!document.querySelector('input[type="file"]'));

        console.log(`File upload component present: ${hasFileUpload}`);

        // Take a screenshot
        await page.screenshot({ path: 'evidence-page-screenshot.png' });
        console.log('Screenshot saved to evidence-page-screenshot.png');

        // Output test results
        console.log('\nTest Results:');
        console.log('-------------');
        console.log(`Deceased name fields: ${hasDeceasedFirstName && hasDeceasedLastName ? 'PASS' : 'FAIL'}`);
        console.log(`Applicant name fields: ${hasFirstName && hasLastName ? 'PASS' : 'FAIL'}`);
        console.log(`Document type checkboxes removed: ${!hasDocTypeCheckboxes ? 'PASS' : 'FAIL'}`);
        console.log(`File upload component: ${hasFileUpload ? 'PASS' : 'FAIL'}`);

    } catch (error) {
        console.error('Test error:', error);
    } finally {
        // Close the browser
        await browser.close();
    }
}

// Execute the test
testEvidenceUploadUI().catch(console.error);
