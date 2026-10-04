import { describe, expect, it } from "vitest";
import {
  hasProfileChanged,
  isProfileComplete,
  profileFieldsFromRecord,
} from "./profile-form-state";

describe("resident profile form state", () => {
  it("copies editable fields without API-only verification metadata", () => {
    const profile = profileFieldsFromRecord({
      firstName: "Ari",
      middleName: null,
      lastName: "Santos",
      suffix: null,
      birthDate: "1990-01-02",
      civilStatus: null,
      contactNumber: null,
      houseStreet: "10 Main Street",
      purokSitio: null,
      barangay: "Central",
      municipality: "Sample City",
      province: "Sample Province",
      postalCode: null,
      profileVerifiedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(profile).not.toHaveProperty("profileVerifiedAt");
    expect(Object.keys(profile)).not.toContain("profileVerifiedAt");
    expect(isProfileComplete(profile)).toBe(true);
  });

  it("does not consider a profile changed when its editable fields match", () => {
    const profile = profileFieldsFromRecord({ firstName: "Ari", lastName: "Santos" });
    const unchanged = { ...profile };
    const changed = { ...profile, barangay: "North" };

    expect(hasProfileChanged(unchanged, profile)).toBe(false);
    expect(hasProfileChanged(changed, profile)).toBe(true);
    expect(isProfileComplete(profile)).toBe(false);
  });
});