export type ProfileFields = {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  birthDate: string;
  civilStatus: string;
  contactNumber: string;
  houseStreet: string;
  purokSitio: string;
  barangay: string;
  municipality: string;
  province: string;
  postalCode: string;
};

export type ResidentProfileRecord = Partial<
  Record<keyof ProfileFields | "profileVerifiedAt", string | null>
> | null;

export const emptyProfile: ProfileFields = {
  firstName: "",
  middleName: "",
  lastName: "",
  suffix: "",
  birthDate: "",
  civilStatus: "",
  contactNumber: "",
  houseStreet: "",
  purokSitio: "",
  barangay: "",
  municipality: "",
  province: "",
  postalCode: "",
};

const requiredFields: Array<keyof ProfileFields> = [
  "firstName",
  "lastName",
  "birthDate",
  "houseStreet",
  "barangay",
  "municipality",
  "province",
];

const editableFields = Object.keys(emptyProfile) as Array<keyof ProfileFields>;

export function profileFieldsFromRecord(record: ResidentProfileRecord): ProfileFields {
  return Object.fromEntries(
    editableFields.map((field) => [field, record?.[field] ?? ""]),
  ) as ProfileFields;
}

export function isProfileComplete(profile: ProfileFields) {
  return requiredFields.every((field) => profile[field].trim().length > 0);
}

export function hasProfileChanged(current: ProfileFields, saved: ProfileFields) {
  return editableFields.some((field) => current[field] !== saved[field]);
}