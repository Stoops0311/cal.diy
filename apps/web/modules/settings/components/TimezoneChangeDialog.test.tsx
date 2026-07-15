import { render } from "@testing-library/react";
import TimezoneChangeDialog from "./TimezoneChangeDialog";

describe("TimezoneChangeDialog", () => {
  it("stays out of the modal layer while a higher-priority prompt is open", () => {
    const { container } = render(<TimezoneChangeDialog disabled />);

    expect(container).toBeEmptyDOMElement();
  });
});
