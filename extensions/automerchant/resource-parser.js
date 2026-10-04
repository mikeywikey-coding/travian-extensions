/**
 * Travian NPC Resource Helper - Resource Parser
 */
/* global NPC */

NPC.ResourceParser = {
	getVillageStock() {
		return [1, 2, 3, 4].map((number) =>
			NPC.Utils.parseNumber(document.querySelector("#l" + number)?.textContent),
		);
	},

	parseNPCDialog() {
		const data = { current: {}, desired: {}, diffs: {}, needed: {}, total: 0, remain: 0 };

		for (let i = 0; i < 4; i++) {
			const orgEl = document.querySelector(`#org${i}`);
			data.current[i] = NPC.Utils.parseNumber(orgEl?.textContent);

			const desiredInput = document.querySelector(`input[name="desired${i}"]`);
			data.desired[i] = NPC.Utils.parseNumber(desiredInput?.value);

			const diffEl = document.querySelector(`#diff${i}`);
			const diffText = diffEl?.textContent?.trim() || "0";
			data.diffs[i] = diffText;

			if (diffText.startsWith("+")) {
				data.needed[i] =
					parseInt(diffText.substring(1).replace(/\D/g, ""), 10) || 0;
			} else {
				data.needed[i] = 0;
			}

			data.total += data.current[i];
		}

		data.remain = NPC.Utils.parseNumber(
			document.querySelector("#remain")?.textContent,
		);

		return data;
	},
};
