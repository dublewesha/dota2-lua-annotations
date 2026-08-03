---@diagnostic disable: lowercase-global, missing-return

---@class CDOTA_Item_Physical : CBaseAnimatingActivity
_G.CDOTA_Item_Physical = {}

--- Returned the contained item.  
--- Env: only in `server`
---@return CDOTA_Item
function CDOTA_Item_Physical:GetContainedItem() end

--- Returns the game time when this item was created in the world.  
--- Env: only in `server`
---@return float
function CDOTA_Item_Physical:GetCreationTime() end

--- Is this drop flagged as a loot drop?  
--- Env: only in `server`
---@return bool
function CDOTA_Item_Physical:IsLoot() end

--- Set the contained item.  
--- Env: only in `server`
---@param item CDOTA_Item
---@return nil
function CDOTA_Item_Physical:SetContainedItem(item) end

--- Set if this drop is flagged as a loot drop.  
--- Env: only in `server`
---@param isLoot bool
---@return nil
function CDOTA_Item_Physical:SetIsLoot(isLoot) end

