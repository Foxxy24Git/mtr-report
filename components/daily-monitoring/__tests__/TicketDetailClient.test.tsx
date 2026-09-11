import { createElement, type ChangeEvent, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VendorSelect } from "../TicketDetailClient";

describe("pilihan Vendor pada Ubah Detail Gangguan", () => {
  it("memakai select dari Vendor Master dan mempertahankan nilai vendor lama", () => {
    const html = renderToStaticMarkup(
      createElement(VendorSelect, {
        value: "Vendor Lama",
        options: ["Artajasa", "Bringin"],
        onChange: () => undefined,
      })
    );

    expect(html).toContain('<select id="vendor"');
    expect(html).not.toContain('<input id="vendor"');
    expect(html).toContain('<option value="">Default</option>');
    expect(html).toContain('<option value="Artajasa">Artajasa</option>');
    expect(html).toContain('<option value="Bringin">Bringin</option>');
    expect(html).toContain(
      '<option value="Vendor Lama" selected="">Vendor Lama</option>'
    );
  });

  it("mengosongkan vendor saat Default dipilih", () => {
    const selected: string[] = [];
    const element = VendorSelect({
      value: "Bringin",
      options: ["Bringin"],
      onChange: (value) => selected.push(value),
    }) as ReactElement<{
      onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
    }>;

    element.props.onChange({ target: { value: "" } } as ChangeEvent<HTMLSelectElement>);

    expect(selected).toEqual([""]);
  });
});
