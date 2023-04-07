// On each mouse move, do 10 milliseconds of work.
const moveWork = makeTask("moveMouse");
window.addEventListener("mousemove", function moveHandler() {
  moveWork(10);
});

// Start the test by clicking on the screen.
window.addEventListener("click", async function runExamples(event) {
  if (event.target.tagName === "A") {
    // This is a link, ignore it.
    return;
  }
  document.body.innerText = "Running the test, move your mouse continuously for a couple of seconds."

  // Run a fully synchronous function that does lots of CPU work.
  runBlockedEventLoop();

  // Wait for 1 second.
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Run a function that has `await` calls, but with no idle time.
  await runAwaitedEventLoop();

  // Signal that the test is done.
  document.body.innerText = "Done running tests. Capture the profile. Refresh to try again.";
});

/**
 * The returned function does `delayMs` worth of work.
 * @param {string} name
 * @returns {(delayMS: number) => void}
 */
function makeTask(name) {
  // Create a function with a name. The only way to do this in JS is to use
  // eval-like things.
  function createNamedFunction(name, args, body) {
    const argsString = args.join(", ");
    const create = new Function(`
      return function ${name}(${argsString}) {
        ${body}
      }
    `)
    return create();
  };

  return createNamedFunction(name, ["delayMS"], /* js */ `
    const targetTime = performance.now() + delayMS;
    while (performance.now() < targetTime) {
      // Wait.
    }
  `);
}

/**
 * This demonstarts fully synchronous work, with some task scheduling through setTimeout
 * and requestAnimationFrame.
 */
function runBlockedEventLoop() {
  // Run a task for 100ms.
  makeTask("firstTask")(100);

  // Now start a timer for 100ms.
  setTimeout(function timeoutA() {
    makeTask("workInTimeoutA")(100)
  }, 100);

  // An animation frame will resolve before the setTimeout, but after the sync work below.
  requestAnimationFrame(function animationFrameACallback() {
    makeTask("animationFrameA")(100)
  });

  // Block the main thread for a bit with pieces of synchronous work.
  makeTask("syncWorkA")(100);
  makeTask("syncWorkB")(100);
  makeTask("syncWorkC")(100);
  makeTask("syncWorkD")(100);
  makeTask("syncWorkE")(100);

  // The requestAnimationFrame will resolve first.

  // The timer will resolve after the requestAnimationFrame. It's much longer than 100ms
  // that was requested, but the main thread was blocked with work.
}

/**
 * Run work that is done in an `async` loop.
 */
async function runAwaitedEventLoop() {
  // Run a task for 100ms. The caller for this function in the performance profile will be
  // `runExamples` since we have done an await yet.
  makeTask("beforeFirstAwait")(100);

  // Trigger the first await. Notice here and below we don't actually need promises
  // to await. The code will go back to the event loop and take more work.
  await null;

  // This work will now happen with a caller of `AsyncFunctionNext` (in Firefox) which
  // indicates it's from a resumed async function.
  makeTask("afterFirstAwait")(100);

  // Schedule some tasks again.

  // Start with the first "requestAnimationFrame"
  requestAnimationFrame(function animationFrameACallback() {
    makeTask("animationFrameA")(100)
  });

  // Also schedule a timeout.
  setTimeout(function timeoutA() {
    makeTask("timeoutA_work")(100)
  }, 100);

  // And request a second "requestAnimationFrame".
  requestAnimationFrame(function animationFrameBCallback() {
    makeTask("animationFrameB")(100)
  });

  // Run expensive work, but await after each one. These will all run and block
  // the previous tasks from running. These will also block any move events from
  // being handled.
  await makeTask("awaitedTaskA")(100);
  await makeTask("awaitedTaskB")(100);
  await makeTask("awaitedTaskC")(100);
  await makeTask("awaitedTaskD")(100);
  await makeTask("awaitedTaskE")(100);

  // The two requestAnimationFrame calls will both now resolve AFTER the "awaitedTask"
  // work. Note that both the work from animationFrameA and animationFrameB will be
  // done in the same animation frame.

  // The timer will resolve last, as it's the lowest priority.
}
