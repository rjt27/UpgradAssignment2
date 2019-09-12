/**
 * New script file
 */

/** 
 * Create a new Property 
 * @param {org.property.registration.createProperty} tx
 * @transaction
 */
async function createProperty(tx) {
  const factory = getFactory();
  const namespace = 'org.property.registration';
  const me = getCurrentParticipant();

  /* get a new Property resource from factory */
  const property = factory.newResource(namespace, 'Property', tx.PID);

  /* update the property fields from transaction info */
  property.marketPrice = tx.marketPrice;
  property.registrationDate = tx.registrationDate;
  property.propertyType = tx.propertyType;
  property.location = tx.location;
  property.owner = me;
  
  /* Save property to the registry. Fail, if PID already exists */
  const registry = await getAssetRegistry(property.getFullyQualifiedType());
  const isExists = await registry.get(tx.PID).catch(err => {
    console.log('Property not found');
  });
  if(isExists) { 
    throw new Error('Property with this ID already exists');
  } else {
    await registry.add(property);
  }
}


/** 
 * Property owner want to list property available for sale
 * @param {org.property.registration.intentForSale} tx
 * @transaction
 */
async function intentForSale(tx) {
  const factory = getFactory();
  const namespace = 'org.property.registration';
  const me = getCurrentParticipant();

  /* check if transcation is for valid PID or not */
  let propRegistry = await getAssetRegistry('org.property.registration.Property');
  const isExists = await propRegistry.get(tx.property.PID).catch(err => {
    console.log('Property not found');
  });

  if(isExists) {
    /* 
     * check owner has to be same transaction-owner of the property to list a
     * property for sell listing. Otherwise, throw an error.
     */
    if (me.getFullyQualifiedIdentifier() != tx.property.owner.getFullyQualifiedIdentifier()) {
      throw new Error('You do not own this Property');
    }
    tx.property.status = "Intent for sale";
    await propRegistry.update(tx.property);

    /* Save property to the PropertyListing registry. */
    const propertyListing = factory.newResource(namespace, 'PropertyListing', tx.property.PID);

    propertyListing.property = tx.property;
    let propListRegistry = await getAssetRegistry('org.property.registration.PropertyListing');
    await propListRegistry.add(propertyListing);
  } else {
    throw new Error('Property with this ID does not exist');
  }
}

/** 
 * Purchase Property available for sale
 * @param {org.property.registration.purchaseProperty} tx
 * @transaction
 */
async function purchaseProperty(tx) {
  const me = getCurrentParticipant();
  
  /* 
   * check if transcation is for valid PID from PropertListing or not
   * i.e., A property has to be listed for sale.
   */
  const plRegistry = await getAssetRegistry('org.property.registration.PropertyListing');
  const isExists = await plRegistry.get(tx.propertylist.PlistID).catch(err => {
    console.log('Property not found');
  });
  if(isExists) {
    const propRegistry = await getAssetRegistry('org.property.registration.Property');
    const property = await propRegistry.get(tx.propertylist.PlistID);

    /* 
     * check owner has to be different from transaction-owner of the property to purchased.
     * i.e. aovid a user to purchase a property already by him/her-self.
     */
    if (me.getFullyQualifiedIdentifier() == property.owner.getFullyQualifiedIdentifier()) {
      throw new Error('You already own this Property');
    }

    /* check for sufficient user balance, who is willing to purchase property */
    if(property.marketPrice > me.balance) {
      throw new Error('You dont have enough balance to purchase this property');
    }

    /* read user registry, update the balances of buyer & seller appropriately */
    let userRegistry = await getParticipantRegistry('org.property.registration.User');
    const buyer = await userRegistry.get(me.getIdentifier());
    buyer.balance -= property.marketPrice;
    await userRegistry.update(buyer);
    const seller = await userRegistry.get(property.owner.getIdentifier());
    seller.balance += property.marketPrice;
    await userRegistry.update(seller);

    /* 
     * Upate the property owner. mark the property as 'Registered' again.
     * update the property in Property regisrty.
     */
    property.owner = me;
    property.status = "Registered";
    await propRegistry.update(property);
    
    /* Remove the property from PorpertyListing Asset registry */
    await plRegistry.remove(tx.propertylist.PlistID);
  } else { 
    throw new Error('Property with this ID is not available for sale');
  }
}
