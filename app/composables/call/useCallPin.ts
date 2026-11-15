import { ref, type Ref } from "vue";

// The selection belongs to the call session and survives switching views.
const pins = new WeakMap<object, Ref<string | undefined>>();
export function useCallPin(session: object) {
  let pin = pins.get(session);
  if (!pin) {
    pin = ref<string>();
    pins.set(session, pin);
  }
  return pin;
}
