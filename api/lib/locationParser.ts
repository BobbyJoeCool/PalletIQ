// Location barcode parsing — defined once in shared/location.ts (#217) and re-exported here
// for the API's existing importers.
export {
  type ParsedLocation,
  type ParsedFullLocation,
  parseLocationBarcode,
  parseFullLocationBarcode,
  formatLocationId,
} from '../../shared/location.js';
