import type {
  BoothAction,
  BoothState,
} from '@photovoks/shared-types';

export const initialBoothState: BoothState = {
  step: 'idle',
  sessionId: null,
  sessionToken: null,
  selectedFrame: null,
  captures: [null, null, null],
  retakesUsed: [false, false, false],
  selectedPhotoIndex: 1,
  composedStripBlob: null,
  composedSheetBlob: null,
  uploadPending: false,
  printJobId: null,
  printJobStatus: null,
  event: null,
  error: null,
};

export function boothReducer(state: BoothState, action: BoothAction): BoothState {
  switch (action.type) {
    case 'RESET':
      // Keep the loaded active event: it is fetched once by the booth layout,
      // so wiping it would leave the next visitor with "no frames".
      return { ...initialBoothState, event: state.event };

    case 'SET_EVENT':
      return { ...state, event: action.event };

    case 'ACCEPT_CONSENT':
      // Tap-to-start on idle screen transitions to consent step
      return { ...state, step: 'consent', error: null };

    case 'DECLINE_CONSENT':
      // Declining returns to the initial state (event stays loaded)
      return { ...initialBoothState, event: state.event };

    case 'SELECT_FRAME':
      return {
        ...state,
        selectedFrame: action.frame,
        step: 'capture',
        captures: [null, null, null],
        retakesUsed: [false, false, false],
        composedStripBlob: null,
        composedSheetBlob: null,
        error: null,
      };

    case 'CAPTURE_PHOTO': {
      const captures = [...state.captures] as (Blob | null)[];
      captures[action.slotIndex] = action.blob;
      // Advance to preview once all 3 slots are captured
      const allCaptured = captures.every((c) => c !== null);
      return {
        ...state,
        captures,
        step: allCaptured ? 'preview' : state.step,
      };
    }

    case 'USE_RETAKE': {
      const retakesUsed = [...state.retakesUsed] as boolean[];
      retakesUsed[action.slotIndex] = true;
      return { ...state, retakesUsed };
    }

    case 'SET_SKETCH_PHOTO':
      return { ...state, selectedPhotoIndex: action.index };

    case 'CONFIRM_PREVIEW':
      return { ...state, step: 'composing', uploadPending: true };

    case 'STORE_COMPOSED_STRIP':
      return {
        ...state,
        composedStripBlob: action.stripBlob,
        composedSheetBlob: action.sheetBlob,
      };

    case 'UPLOAD_COMPLETE':
      return {
        ...state,
        sessionId: action.sessionId,
        sessionToken: action.sessionToken,
        printJobId: action.printJobId,
        step: 'end',
        uploadPending: false,
        error: null,
      };

    case 'UPLOAD_FAILED':
      return {
        ...state,
        uploadPending: false,
        error: 'upload_failed_max_retries',
      };

    case 'PRINT_STATUS_UPDATE':
      return { ...state, printJobStatus: action.status };

    case 'DISMISS_END_SCREEN':
      return { ...initialBoothState, event: state.event };

    case 'SET_ERROR':
      return { ...state, error: action.error };

    default:
      return state;
  }
}
