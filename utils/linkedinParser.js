/**
 * linkedinParser.js
 * Responsible for extracting structured profile data from the LinkedIn DOM.
 * Uses safe selectors with fallbacks to handle LinkedIn's dynamic rendering.
 */

/**
 * Waits for a DOM element to appear within a timeout period.
 * Needed because LinkedIn lazy-loads sections via React/SPA routing.
 * @param {string} selector - CSS selector to wait for
 * @param {number} timeout - max wait time in ms
 * @returns {Promise<Element|null>}
 */
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Resolve null after timeout to avoid hanging
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

/**
 * Extracts plain text from a section element safely.
 * @param {Element|null} sectionEl
 * @returns {string}
 */
function extractSectionText(sectionEl) {
  if (!sectionEl) return "";
  // Try to get the readable text, stripping button labels / extra whitespace
  return sectionEl.innerText?.trim().replace(/\s+/g, " ") || "";
}

/**
 * Extracts experience entries from the Experience section.
 * Returns an array of strings (job titles / companies).
 * @param {Element|null} expSection
 * @returns {string[]}
 */
function extractExperience(expSection) {
  if (!expSection) return [];
  // LinkedIn renders experience items inside list items
  const items = Array.from(
    expSection.querySelectorAll("li") || []
  );
  return items
    .map((li) => li.innerText?.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, 10); // cap at 10 entries
}

/**
 * Extracts individual skills listed under the Skills section.
 * @param {Element|null} skillsSection
 * @returns {string[]}
 */
function extractSkills(skillsSection) {
  if (!skillsSection) return [];
  const items = Array.from(
    skillsSection.querySelectorAll("li") || []
  );
  return items
    .map((li) => li.innerText?.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, 20); // cap at 20 skills
}

/**
 * Main entry point: parse the full LinkedIn profile from the current page DOM.
 * Returns a structured profile object ready to send to the AI.
 * @returns {Promise<Object>}
 */
async function parseLinkedInProfile() {
  // Wait for the main profile header to be present (SPA might still be loading)
  await waitForElement("h1", 8000);

  // ── Name ─────────────────────────────────────────────────────────────────
  const name =
    document.querySelector("h1")?.innerText?.trim() || "";

  // ── Headline ─────────────────────────────────────────────────────────────
  const headline =
    document.querySelector(".text-body-medium")?.innerText?.trim() || "";

  // ── Location ─────────────────────────────────────────────────────────────
  const location =
    document
      .querySelector(
        ".text-body-small.inline.t-black--light.break-words"
      )
      ?.innerText?.trim() || "";

  // ── About ─────────────────────────────────────────────────────────────────
  // LinkedIn hides the full about text behind an aria-hidden span
  const allSections = Array.from(document.querySelectorAll("section"));

  const aboutSection = allSections.find((s) =>
    s.innerText?.includes("About")
  );
  const about =
    aboutSection
      ?.querySelector("span[aria-hidden='true']")
      ?.innerText?.trim() || "";

  // ── Experience ────────────────────────────────────────────────────────────
  const expSection = allSections.find((s) =>
    s.innerText?.includes("Experience")
  );
  const experience = extractExperience(expSection);

  // ── Skills ────────────────────────────────────────────────────────────────
  const skillsSection = allSections.find((s) =>
    s.innerText?.includes("Skills")
  );
  const skills = extractSkills(skillsSection);

  return {
    name,
    headline,
    location,
    about,
    experience,
    skills,
  };
}

// Expose for use in contentScript.js (injected at document_idle in the same context)
window.__talentifyParser = { parseLinkedInProfile };
