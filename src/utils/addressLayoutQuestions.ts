/**
 * Address Layout Questions — dropdown options for identifying the layout
 * of a saved address. Every question defaults to "Unsure" and anything
 * marked "unsure" is stripped before sending to the dispatcher.
 */

export interface LayoutQuestion {
  key: string;          // matches AddressLayoutInfo field
  label: string;        // shown to user
  options: { value: string; label: string }[];
  type: 'dropdown' | 'text'; // 'text' = free-form input
  numeric?: boolean;    // true = numeric keyboard for text fields
}

const LAYOUT_QUESTIONS: LayoutQuestion[] = [
  {
    key: 'buildingType',
    label: 'Building Type',
    type: 'dropdown',
    options: [
      { value: 'unsure', label: 'Unsure' },
      { value: 'house', label: 'House' },
      { value: 'apartment', label: 'Apartment' },
      { value: 'condo', label: 'Condo' },
      { value: 'townhouse', label: 'Townhouse' },
      { value: 'office', label: 'Office Building' },
    ],
  },
  {
    key: 'totalFloors',
    label: 'Total Floors in Building',
    type: 'text',
    numeric: true,
    options: [],
  },
  {
    key: 'hasElevator',
    label: 'Is There an Elevator?',
    type: 'dropdown',
    options: [
      { value: 'unsure', label: 'Unsure' },
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
  },
  {
    key: 'hasGate',
    label: 'Is There a Gate?',
    type: 'dropdown',
    options: [
      { value: 'unsure', label: 'Unsure' },
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
  },
  {
    key: 'gateCode',
    label: 'Gate / Door Code',
    type: 'text',
    options: [],
  },
  {
    key: 'parkingLocation',
    label: 'Parking / Access Area',
    type: 'dropdown',
    options: [
      { value: 'unsure', label: 'Unsure' },
      { value: 'street', label: 'Street Parking' },
      { value: 'driveway', label: 'Driveway' },
      { value: 'garage', label: 'Garage' },
      { value: 'lot', label: 'Parking Lot' },
    ],
  },
  {
    key: 'nearestCrossStreet',
    label: 'Nearest Cross Street',
    type: 'text',
    options: [],
  },
  {
    key: 'entranceSide',
    label: 'Main Entrance Location',
    type: 'dropdown',
    options: [
      { value: 'unsure', label: 'Unsure' },
      { value: 'front', label: 'Front of Building' },
      { value: 'side', label: 'Side of Building' },
      { value: 'back', label: 'Back of Building' },
    ],
  },
  {
    key: 'hasStairs',
    label: 'Are There Stairs to Enter?',
    type: 'dropdown',
    options: [
      { value: 'unsure', label: 'Unsure' },
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
  },
];

export default LAYOUT_QUESTIONS;
