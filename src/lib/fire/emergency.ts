/**
 * Country emergency directory — independent of the satellite feed.
 * Each number must cite an authoritative government source and a verification date.
 * Countries without a verified entry show official links only; numbers are never guessed.
 */
export interface EmergencyEntry {
  country: string;
  numbers: { label: string; number: string }[];
  agencies: { name: string; url: string }[];
  source: { name: string; url: string };
  verified: string; // YYYY-MM-DD
}

export const EMERGENCY_DIRECTORY: Record<string, EmergencyEntry> = {
  Oman: {
    country: "Oman",
    numbers: [{ label: "Emergency (police, civil defence, ambulance)", number: "9999" }],
    agencies: [
      { name: "Civil Defence and Ambulance Authority (CDAA)", url: "https://cdaa.gov.om/" },
      { name: "Royal Oman Police", url: "https://www.rop.gov.om/" },
    ],
    source: { name: "Oman government portal — Emergency numbers (gov.om)", url: "https://gov.om/emergency-numbers" },
    verified: "2026-10-26",
  },
};

export const SUPPORTED_EMERGENCY = Object.keys(EMERGENCY_DIRECTORY);
export const emergencyFor = (country: string | null) => (country ? EMERGENCY_DIRECTORY[country] ?? null : null);
