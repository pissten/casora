"""Adaptive Lighting switch-to-lights map for dashboard tiles.

By default, the adaptive_lighting integration sets include_config_in_attributes
to False, leaving switch.attributes['configuration'] empty on the frontend
(and omitting manual_control while a switch is off). This WebSocket command
returns each main Adaptive Lighting switch and its configured lights so every
dashboard user (including non-admin wallpanels) can display and toggle manual
control on matching light tiles.
"""

from __future__ import annotations

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er

from .const import DOMAIN

_SUB_SUFFIXES = ("_sleep_mode", "_adapt_color", "_adapt_brightness")
_AL_DOMAINS = ("adaptive_lighting", "adaptive_lighting_knx")


def _switches_map(hass: HomeAssistant) -> dict[str, list[str]]:
    ent_reg = er.async_get(hass)
    out: dict[str, list[str]] = {}
    for dom in _AL_DOMAINS:
        for entry in hass.config_entries.async_entries(dom):
            raw = entry.options.get("lights")
            if raw is None:
                raw = entry.data.get("lights")
            if not isinstance(raw, list):
                continue
            lights = [s for s in raw if isinstance(s, str) and "." in s]
            if not lights:
                continue
            main_switch: str | None = None
            for reg_entry in er.async_entries_for_config_entry(ent_reg, entry.entry_id):
                if reg_entry.domain != "switch" or reg_entry.disabled_by is not None:
                    continue
                uid = str(reg_entry.unique_id or "")
                eid = reg_entry.entity_id
                if uid.endswith(_SUB_SUFFIXES) or any(
                    f"_{sub.lstrip('_')}_" in eid or eid.endswith(sub) for sub in _SUB_SUFFIXES
                ):
                    continue
                main_switch = eid
                break
            if main_switch:
                out[main_switch] = lights
    return out


@websocket_api.websocket_command({vol.Required("type"): "casora/adaptive_lighting"})
@callback
def ws_adaptive_lighting(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Return {switches: {switch_entity_id: [light_entity_id, ...]}}."""
    connection.send_result(msg["id"], {"switches": _switches_map(hass)})


def async_setup_adaptive_lighting(hass: HomeAssistant) -> None:
    """Register the casora/adaptive_lighting WebSocket command once."""
    data = hass.data.setdefault(DOMAIN, {})
    if not data.get("adaptive_lighting_ws"):
        websocket_api.async_register_command(hass, ws_adaptive_lighting)
        data["adaptive_lighting_ws"] = True
