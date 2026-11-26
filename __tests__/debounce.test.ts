import { createTrailingDebouncer } from '../src/lib/debounce';

describe('createTrailingDebouncer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('coalesces burst events into a single trailing execution', () => {
    const fn = jest.fn();
    const debouncer = createTrailingDebouncer(fn, 350);

    debouncer.trigger();
    debouncer.trigger();
    debouncer.trigger();

    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(349);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('cancel prevents pending execution on unmount', () => {
    const fn = jest.fn();
    const debouncer = createTrailingDebouncer(fn, 350);

    debouncer.trigger();
    debouncer.cancel();
    jest.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
  });
});
