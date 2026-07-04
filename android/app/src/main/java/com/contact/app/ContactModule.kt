package com.contact.app

import android.content.ContentProviderOperation
import android.content.Context
import android.provider.ContactsContract
import android.provider.ContactsContract.CommonDataKinds.Phone
import android.provider.ContactsContract.CommonDataKinds.StructuredName
import android.provider.ContactsContract.RawContacts
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

/**
 * Custom native module that inserts a contact directly via ContentProviderOperation.
 * Bypasses expo-contacts' hardcoded null-account issue on Android 14+.
 *
 * Resolves the writable account from existing RawContacts so GET_ACCOUNTS
 * permission is NOT needed — only READ_CONTACTS/WRITE_CONTACTS.
 */
class ContactModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "CustomContactModule"

  @ReactMethod
  fun addContact(data: ReadableMap, promise: Promise) {
    try {
      val name = data.getString("name") ?: ""
      val phoneNumber = data.getString("phoneNumber") ?: ""
      if (phoneNumber.isBlank()) {
        promise.reject("CONTACT_ERROR", "Phone number is required")
        return
      }

      val ctx: Context = reactApplicationContext
      val accountInfo = resolveWritableAccount(ctx)

      val ops = ArrayList<ContentProviderOperation>()

      // 1. Insert RawContact with resolved account (not null!)
      ops.add(
        ContentProviderOperation.newInsert(RawContacts.CONTENT_URI)
          .withValue(RawContacts.ACCOUNT_TYPE, accountInfo.first)
          .withValue(RawContacts.ACCOUNT_NAME, accountInfo.second)
          .build()
      )

      // 2. Insert contact name
      if (name.isNotBlank()) {
        ops.add(
          ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
            .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
            .withValue(ContactsContract.Data.MIMETYPE, StructuredName.CONTENT_ITEM_TYPE)
            .withValue(StructuredName.DISPLAY_NAME, name)
            .build()
        )
      }

      // 3. Insert phone number
      ops.add(
        ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
          .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
          .withValue(ContactsContract.Data.MIMETYPE, Phone.CONTENT_ITEM_TYPE)
          .withValue(Phone.NUMBER, phoneNumber)
          .withValue(Phone.TYPE, Phone.TYPE_MOBILE)
          .build()
      )

      ctx.contentResolver.applyBatch(ContactsContract.AUTHORITY, ops)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("CONTACT_CREATION_FAILED", e.message, e)
    }
  }

  /**
   * Resolves the best writable account from existing contacts.
   * Only needs READ_CONTACTS — NO GET_ACCOUNTS permission required.
   * Returns (accountType, accountName).
   */
  private fun resolveWritableAccount(context: Context): Pair<String?, String?> {
    // Source 1: RawContacts table — each row has the account used to create it
    try {
      val projection = arrayOf(RawContacts.ACCOUNT_TYPE, RawContacts.ACCOUNT_NAME)
      val selection = "${RawContacts.ACCOUNT_TYPE} IS NOT NULL AND ${RawContacts.ACCOUNT_TYPE} != ''"
      context.contentResolver.query(
        RawContacts.CONTENT_URI, projection, selection, null, null
      )?.use { cursor ->
        var googleType: String? = null
        var googleName: String? = null
        var firstType: String? = null
        var firstName: String? = null
        while (cursor.moveToNext()) {
          val t = cursor.getString(0) ?: continue
          val n = cursor.getString(1) ?: continue
          if (firstType == null) { firstType = t; firstName = n }
          if ("com.google".equals(t, ignoreCase = true)) {
            googleType = t; googleName = n
            break
          }
        }
        if (googleType != null) return Pair(googleType, googleName)
        if (firstType != null) return Pair(firstType, firstName)
      }
    } catch (_: Exception) {}

    // Source 2: ContactsContract.Settings table (sync settings)
    try {
      val projection = arrayOf(
        ContactsContract.Settings.ACCOUNT_NAME,
        ContactsContract.Settings.ACCOUNT_TYPE
      )
      context.contentResolver.query(
        ContactsContract.Settings.CONTENT_URI, projection, null, null, null
      )?.use { cursor ->
        if (cursor.moveToFirst()) {
          val name = cursor.getString(0)
          val type = cursor.getString(1)
          if (type != null && name != null) return Pair(type, name)
        }
      }
    } catch (_: Exception) {}

    // No account found — return nulls. Android 14+ will reject this but
    // the caller catches the error and falls back to Intent.ACTION_INSERT.
    return Pair(null, null)
  }
}
