# iOS Flow Examples

This directory contains example Maestro Mobile YAML flows for common iOS automation scenarios. Each flow demonstrates best practices and patterns for UI testing.

## Available Examples

| Flow | Description | Use Case |
|------|-------------|----------|
| [login-flow.yaml](login-flow.yaml) | Complete authentication flow | Testing login functionality |
| [onboarding-flow.yaml](onboarding-flow.yaml) | Multi-screen onboarding | First-run user experience |
| [search-flow.yaml](search-flow.yaml) | Search and results | Search functionality testing |
| [form-validation-flow.yaml](form-validation-flow.yaml) | Input validation and errors | Form edge cases and validation |
| [settings-navigation-flow.yaml](settings-navigation-flow.yaml) | Settings hierarchy | Navigation and toggles |
| [shopping-cart-flow.yaml](shopping-cart-flow.yaml) | E-commerce checkout | Cart and purchase flow |
| [pull-to-refresh-flow.yaml](pull-to-refresh-flow.yaml) | Refresh gestures | List refresh patterns |
| [deep-link-flow.yaml](deep-link-flow.yaml) | URL schemes and universal links | Deep link handling |
| [photo-picker-flow.yaml](photo-picker-flow.yaml) | Photo selection and upload | Media handling |
| [logout-flow.yaml](logout-flow.yaml) | User logout and cleanup | Session management |

## Running Examples

1. **Update the bundle ID** in each flow file to match your app:
   ```yaml
   appId: com.yourcompany.yourapp
   ```

2. **Update element identifiers** to match your app's accessibility IDs:
   ```yaml
   - tapOn:
       id: "your_element_id"
   ```

3. **Run with Maestro**:
   ```bash
   # Run a single flow
   maestro test login-flow.yaml

   # Run with specific simulator
   maestro test --device "iPhone 15 Pro" login-flow.yaml

   # Run all flows in directory
   maestro test .
   ```

4. **Or use from Maestro app**:
   ```
   /ios.run_flow examples/ios-flows/login-flow.yaml
   ```

## Best Practices Demonstrated

### 1. Flow Configuration
Each flow includes proper configuration:
```yaml
appId: com.example.myapp
name: Descriptive Flow Name
tags:
  - category
  - priority
env:
  TEST_VAR: value
```

### 2. Screenshots at Key Points
Strategic screenshot placement for debugging and documentation:
```yaml
- takeScreenshot: "01-initial-state"
# ... actions ...
- takeScreenshot: "02-after-action"
```

### 3. Proper Waiting
Use explicit waits instead of arbitrary delays:
```yaml
- extendedWaitUntil:
    visible:
      text: "Expected Content"
    timeout: 10000
```

### 4. Robust Element Selection
Prefer accessibility IDs, fallback to text:
```yaml
# Best: by ID
- tapOn:
    id: "submit_button"

# Acceptable: by text
- tapOn: "Submit"

# With options: partial match
- tapOn:
    containsText: "Sub"
```

### 5. Clean State Testing
Start with fresh app state for consistent tests:
```yaml
- launchApp:
    clearState: true
```

### 6. Scroll Until Visible
For elements that may be off-screen:
```yaml
- scrollUntilVisible:
    element:
      text: "Footer Element"
    direction: DOWN
```

## Customization Tips

1. **Environment Variables**: Use env vars for test data that changes:
   ```yaml
   env:
     API_URL: https://staging.example.com
   ---
   - inputText: "${API_URL}"
   ```

2. **Modular Flows**: Create reusable sub-flows for common patterns:
   ```yaml
   # login-steps.yaml (reusable)
   - tapOn:
       id: "email_field"
   - inputText: "${EMAIL}"
   ...
   ```

3. **Conditional Logic**: Handle different app states:
   ```yaml
   # Use runFlow with conditional in main test
   - runFlow:
       when:
         visible: "Login"
       file: login-steps.yaml
   ```

## Troubleshooting

If flows fail, check:

1. **Element identifiers**: Use Xcode Accessibility Inspector to verify IDs
2. **Timeouts**: Increase timeouts for slow animations
3. **App state**: Ensure app is in expected state before flow starts
4. **Simulator**: Verify simulator is booted and app is installed

Run with debug mode for more info:
```bash
maestro test --debug login-flow.yaml
```
