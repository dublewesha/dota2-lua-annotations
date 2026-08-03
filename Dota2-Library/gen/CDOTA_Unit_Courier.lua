---@diagnostic disable: lowercase-global, missing-return

---@class CDOTA_Unit_Courier : CDOTA_BaseNPC
_G.CDOTA_Unit_Courier = {}

--- Respawn the courier.  
--- Env: only in `server`
---@return nil
function CDOTA_Unit_Courier:RespawnCourier() end

--- Upgrade the courier ( int param ) times.  
--- Env: only in `server`
---@param level int
---@return nil
function CDOTA_Unit_Courier:UpgradeCourier(level) end

